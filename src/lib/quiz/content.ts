import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

import type { QuizLang } from "@/lib/types";

/**
 * อ่านเนื้อหานิทรรศการจาก ar-content/ แล้วแปลงเป็น "ข้อเท็จจริง" ที่เอาไปตั้งคำถามได้
 *
 * ไฟล์เนื้อหาเขียนเป็นข้อความธรรมดาที่คนแก้เองได้ ขึ้นต้นด้วยหัวข้อ ## แล้วตามด้วย
 * ฟิลด์แบบ "ป้าย: ค่า" ก่อนจะเข้าเนื้อความ ตัวแยกนี้อ่านเฉพาะส่วนฟิลด์
 * เพราะเป็นส่วนที่มีรูปแบบแน่นอนพอจะสร้างคำถามปรนัยได้โดยไม่ต้องเดา
 *
 * แก้เนื้อหาใน ar-content/ แล้วคำถามเปลี่ยนตามทันที ไม่ต้องแก้โค้ด
 */

const CONTENT_ROOT = join(process.cwd(), "ar-content");

/** อ่านไฟล์ใหม่ทุกกี่มิลลิวินาที — เนื้อหาแทบไม่เปลี่ยน แต่ไม่อยากให้ต้องรีสตาร์ทเว็บเวลาแก้ */
const CACHE_MS = 30_000;

/** ป้ายฟิลด์ในไฟล์ภาพจิตรกรรม แยกตามภาษา */
const MURAL_LABELS: Record<QuizLang, { order: string; month: string; scene: string }> = {
  th: { order: "ลำดับในชุด", month: "พระราชพิธีประจำ", scene: "ฉากในภาพ" },
  en: { order: "In the set", month: "Ceremony of", scene: "Scene" },
};

/** ป้ายฟิลด์ในไฟล์ประวัติวัด */
const TEMPLE_LABELS: Record<QuizLang, { formerName: string; founder: string; rank: string }> = {
  th: { formerName: "ชื่อเดิม", founder: "ผู้สถาปนา", rank: "ระดับวัด" },
  en: { formerName: "Former name", founder: "Founder", rank: "Rank" },
};

/** อุปกรณ์ที่มีภาพจิตรกรรมผูกอยู่ เรียงตามลำดับภาพในชุด */
const MURAL_DEVICES = [
  "dev-A", "dev-B", "dev-C", "dev-D", "dev-E", "dev-F",
  "dev-G", "dev-H", "dev-I", "dev-J", "dev-K", "dev-L",
];

const TEMPLE_SITE = "site-1";

export type MuralFact = {
  deviceId: string;
  /** ชื่อพระราชพิธีจากหัวข้อ ## บรรทัดแรก */
  title: string;
  /** ลำดับภาพในชุด 1–12 อ่านจาก "ภาพที่ N จาก 12" */
  order: number | null;
  /** ช่วงเวลาที่จัดพิธี เช่น "เดือน ๑๒" หรือ "สงกรานต์" */
  month: string | null;
  /** สถานที่ในภาพ */
  scene: string | null;
};

export type TempleFact = {
  title: string;
  formerName: string | null;
  founder: string | null;
  rank: string | null;
  /**
   * ชื่อวัดอื่นกับพระมหากษัตริย์ที่ถูกเอ่ยถึงในเนื้อหา เก็บไว้เป็นตัวลวง
   * หยิบจากเนื้อหาจริงทั้งหมด ไม่ได้แต่งขึ้นเอง คำถามจึงยังอิงข้อมูลในโปรเจคล้วน ๆ
   */
  otherTemples: string[];
  otherMonarchs: string[];
};

export type ContentFacts = {
  murals: MuralFact[];
  temple: TempleFact | null;
};

type CacheEntry = { at: number; facts: ContentFacts };

const cache = new Map<QuizLang, CacheEntry>();

/** ไฟล์ภาษาอังกฤษไม่มีก็ถอยไปใช้ไฟล์ไทย เหมือนที่แอป AR ทำ */
function readContent(parts: string[], lang: QuizLang): string | null {
  const name = parts[parts.length - 1];
  const dir = parts.slice(0, -1);
  const candidates = lang === "en" ? [`${name}.en.txt`, `${name}.txt`] : [`${name}.txt`];

  for (const candidate of candidates) {
    try {
      return readFileSync(join(CONTENT_ROOT, ...dir, candidate), "utf8");
    } catch {
      continue;
    }
  }
  return null;
}

/** หัวข้อแรกของไฟล์ — บรรทัดที่ขึ้นต้นด้วย ## */
function firstHeading(text: string): string | null {
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) return line.slice(3).trim() || null;
  }
  return null;
}

/**
 * ค่าของฟิลด์ "ป้าย: ค่า"
 *
 * อ่านเฉพาะก่อนถึงหัวข้อ ## ถัดไป เพราะท้ายไฟล์มีหัวข้อ "เซนเซอร์ที่ภาพนี้"
 * ที่ใช้ป้ายคำว่า "ตำแหน่ง:" ซ้ำกับฟิลด์ด้านบนได้
 */
function field(text: string, label: string): string | null {
  const lines = text.split("\n");
  let seenFirstHeading = false;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (seenFirstHeading) break;
      seenFirstHeading = true;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${label}:`)) continue;
    const value = trimmed.slice(label.length + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}

/** "ภาพที่ 7 จาก 12" / "painting 7 of 12" -> 7 */
function orderFrom(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readMural(deviceId: string, lang: QuizLang): MuralFact | null {
  const text = readContent(["info", deviceId, "info"], lang);
  if (!text) return null;

  const title = firstHeading(text);
  if (!title) return null;

  const labels = MURAL_LABELS[lang];
  return {
    deviceId,
    title,
    order: orderFrom(field(text, labels.order)),
    month: field(text, labels.month),
    scene: field(text, labels.scene),
  };
}

/**
 * เก็บชื่อวัดอื่นที่ถูกเอ่ยถึงในเนื้อหาทั้งหมด ใช้เป็นตัวลวงของคำถามเกี่ยวกับวัด
 * ตัดคำที่ยาวผิดปกติทิ้ง เพราะมักเป็นการจับคำติดกันจนเลยขอบเขตชื่อจริง
 */
function collectTemples(texts: string[], lang: QuizLang, exclude: string[]): string[] {
  const pattern = lang === "en" ? /\bWat [A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*/g : /วัด[ก-๙]{3,30}/g;
  const found = new Set<string>();

  for (const text of texts) {
    for (const match of text.match(pattern) ?? []) {
      const name = match.trim();
      if (name.length < 5) continue;
      if (exclude.some((item) => item.includes(name) || name.includes(item))) continue;
      found.add(name);
    }
  }
  return [...found];
}

/** พระมหากษัตริย์ที่ถูกเอ่ยถึง เช่น "รัชกาลที่ 5" / "Rama V" */
function collectMonarchs(texts: string[], lang: QuizLang, exclude: string | null): string[] {
  const pattern = lang === "en" ? /\bRama [IVX]+/g : /รัชกาลที่ \d+/g;
  const found = new Set<string>();

  for (const text of texts) {
    for (const match of text.match(pattern) ?? []) {
      const name = match.trim();
      if (exclude && exclude.includes(name)) continue;
      found.add(name);
    }
  }
  return [...found];
}

function readTemple(lang: QuizLang, muralTexts: string[]): TempleFact | null {
  const text = readContent(["history", TEMPLE_SITE, "history"], lang);
  if (!text) return null;

  const title = firstHeading(text);
  if (!title) return null;

  const labels = TEMPLE_LABELS[lang];
  const formerName = field(text, labels.formerName);
  const founder = field(text, labels.founder);

  return {
    title,
    formerName,
    founder,
    rank: field(text, labels.rank),
    otherTemples: collectTemples([text, ...muralTexts], lang, [title, formerName ?? ""]),
    otherMonarchs: collectMonarchs([text, ...muralTexts], lang, founder),
  };
}

/** อ่านเนื้อหาทั้งหมดของภาษาหนึ่ง พร้อม cache สั้น ๆ กันอ่านไฟล์ซ้ำทุกคำขอ */
export function loadFacts(lang: QuizLang): ContentFacts {
  const cached = cache.get(lang);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.facts;

  const murals = MURAL_DEVICES.map((deviceId) => readMural(deviceId, lang)).filter(
    (mural): mural is MuralFact => mural !== null,
  );

  const muralTexts = MURAL_DEVICES.map((deviceId) => readContent(["info", deviceId, "info"], lang))
    .filter((text): text is string => text !== null);

  const facts: ContentFacts = {
    murals,
    temple: readTemple(lang, muralTexts),
  };

  cache.set(lang, { at: Date.now(), facts });
  return facts;
}
