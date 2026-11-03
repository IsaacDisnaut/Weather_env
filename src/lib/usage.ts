import "server-only";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import type {
  FeedbackEntry,
  UsageEvent,
  UsagePoint,
  UsageSummary,
} from "@/lib/types";

/**
 * บันทึกการใช้งานแอป AR — สแกนจุดไหน กี่ครั้ง ใช้งานนานเท่าไร และ feedback ที่ส่งเข้ามา
 *
 * เก็บเป็น JSON Lines ต่อท้ายไฟล์ เพราะข้อมูลเป็น event ที่เขียนอย่างเดียวไม่เคยแก้
 * การเขียนแบบ append จึงไม่ต้องอ่านไฟล์ทั้งก้อนก่อน และถ้าไฟล์พังบางบรรทัด
 * (เช่นไฟดับกลางเขียน) ก็ยังอ่านบรรทัดที่เหลือได้ทั้งหมด ต่างจาก JSON ก้อนเดียว
 */

const EVENTS_PATH = join(process.cwd(), "data", "usage-events.jsonl");
const FEEDBACK_PATH = join(process.cwd(), "data", "feedback.jsonl");

/** จำนวนบรรทัดที่เก็บไว้ต่อไฟล์ เกินกว่านี้จะตัดของเก่าทิ้งตอนเขียนรอบถัดไป */
const MAX_LINES = 50_000;

/** ดูย้อนหลังเท่านี้บรรทัดเพื่อกันรายการซ้ำ ตอนแอปส่ง batch เดิมอีกรอบหลังเน็ตหลุด */
const DEDUPE_WINDOW = 5_000;

/** จำนวน feedback ล่าสุดที่ส่งไปให้หน้า dashboard */
const FEEDBACK_PAGE = 50;

const ONE_DAY_MS = 86_400_000;

function readLines(path: string): string[] {
  try {
    return readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "");
  } catch {
    // ยังไม่เคยมีใครส่งอะไรเข้ามา
    return [];
  }
}

function parseLines<T>(path: string, accept: (value: unknown) => T | null): T[] {
  const result: T[] = [];
  for (const line of readLines(path)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const value = accept(parsed);
    if (value) result.push(value);
  }
  return result;
}

function append(path: string, records: object[]): void {
  if (records.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");

  const lines = readLines(path);
  if (lines.length > MAX_LINES) {
    writeFileSync(path, `${lines.slice(-MAX_LINES).join("\n")}\n`, "utf8");
  }
}

/** id ของ event ที่เพิ่งบันทึกไป ใช้กันซ้ำเมื่อแอปส่งชุดเดิมซ้ำ */
function recentIds(path: string): Set<string> {
  const ids = new Set<string>();
  for (const line of readLines(path).slice(-DEDUPE_WINDOW)) {
    try {
      const id = (JSON.parse(line) as { id?: unknown }).id;
      if (typeof id === "string") ids.add(id);
    } catch {
      continue;
    }
  }
  return ids;
}

// ---------- ตรวจรูปแบบข้อมูลที่รับเข้ามา ----------

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function optionalText(value: unknown, max: number): string | null {
  const trimmed = text(value, max).trim();
  return trimmed === "" ? null : trimmed;
}

function count(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.round(parsed), max);
}

/** นาฬิกาของมือถือเพี้ยนได้ — เวลาที่หลุดช่วงที่เป็นไปได้ให้ใช้เวลาเซิร์ฟเวอร์แทน */
function timestamp(value: unknown): number {
  const parsed = Number(value);
  const now = Date.now();
  if (!Number.isFinite(parsed)) return now;
  if (parsed < Date.UTC(2020, 0, 1) || parsed > now + ONE_DAY_MS) return now;
  return Math.round(parsed);
}

function acceptEvent(raw: unknown): UsageEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const id = text(value.id, 64);
  const installId = text(value.installId, 64);
  if (id === "" || installId === "") return null;

  const base = {
    id,
    ts: timestamp(value.ts),
    installId,
    sessionId: text(value.sessionId, 64),
    lang: text(value.lang, 8) || "th",
    appVersion: text(value.appVersion, 32),
  };

  if (value.kind === "scan") {
    const deviceId = text(value.deviceId, 64);
    if (deviceId === "") return null;
    const arucoId = Number(value.arucoId);
    return {
      ...base,
      kind: "scan",
      deviceId,
      arucoId: Number.isInteger(arucoId) ? arucoId : null,
      label: text(value.label, 96) || deviceId,
      location: optionalText(value.location, 96),
      // ดูจุดเดียวเกินหนึ่งวันเป็นไปไม่ได้ — ตัดไว้กันค่าที่ฝั่งแอปคำนวณพลาด
      dwellMs: count(value.dwellMs, ONE_DAY_MS),
    };
  }

  if (value.kind === "session") {
    return {
      ...base,
      kind: "session",
      durationMs: count(value.durationMs, ONE_DAY_MS),
      scanCount: count(value.scanCount, 100_000),
    };
  }

  return null;
}

function acceptFeedback(raw: unknown): FeedbackEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const installId = text(value.installId, 64);
  if (installId === "") return null;

  const rating = Number(value.rating);
  const hasRating = Number.isInteger(rating) && rating >= 1 && rating <= 5;
  const message = text(value.message, 2_000).trim();
  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => text(tag, 48)).filter(Boolean).slice(0, 8)
    : [];

  // ไม่มีทั้งดาว ทั้งข้อความ ทั้งแท็ก = ฟอร์มว่าง ไม่ต้องเก็บ
  if (!hasRating && message === "" && tags.length === 0) return null;

  return {
    id: text(value.id, 64) || `fb-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    ts: timestamp(value.ts),
    installId,
    sessionId: optionalText(value.sessionId, 64),
    rating: hasRating ? rating : null,
    tags,
    message,
    deviceId: optionalText(value.deviceId, 64),
    deviceLabel: optionalText(value.deviceLabel, 96),
    contact: optionalText(value.contact, 128),
    lang: text(value.lang, 8) || "th",
    appVersion: text(value.appVersion, 32),
    sessionMs: count(value.sessionMs, ONE_DAY_MS),
    scanCount: count(value.scanCount, 100_000),
  };
}

// ---------- เขียน ----------

/** บันทึก event จากแอป คืนจำนวนที่รับจริง (ไม่นับรายการซ้ำหรือรูปแบบผิด) */
export function recordEvents(raw: unknown[]): { accepted: number; skipped: number } {
  const batch = raw.slice(0, 500);
  const seen = recentIds(EVENTS_PATH);
  const fresh: UsageEvent[] = [];

  for (const item of batch) {
    const event = acceptEvent(item);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    fresh.push(event);
  }

  append(EVENTS_PATH, fresh);
  return { accepted: fresh.length, skipped: batch.length - fresh.length };
}

export function recordFeedback(raw: unknown): FeedbackEntry | null {
  const entry = acceptFeedback(raw);
  if (!entry) return null;
  append(FEEDBACK_PATH, [entry]);
  return entry;
}

// ---------- อ่าน ----------

export function listEvents(sinceTs?: number): UsageEvent[] {
  const events = parseLines(EVENTS_PATH, acceptEvent);
  return sinceTs ? events.filter((event) => event.ts >= sinceTs) : events;
}

export function listFeedback(sinceTs?: number): FeedbackEntry[] {
  const entries = parseLines(FEEDBACK_PATH, acceptFeedback);
  const filtered = sinceTs ? entries.filter((entry) => entry.ts >= sinceTs) : entries;
  return filtered.sort((a, b) => b.ts - a.ts);
}

/** ใช้เวลาท้องถิ่นของเซิร์ฟเวอร์ เพราะคนอ่านรายงานคิด "วันนี้" ตามเวลาหน้างาน */
function dateKey(ts: number): string {
  const date = new Date(ts);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** สรุปให้หน้า dashboard — จุดไหนถูกสแกนกี่ครั้ง ใช้งานรวมนานเท่าไร feedback ว่าอย่างไร */
export function summarize(sinceTs?: number): UsageSummary {
  const events = listEvents(sinceTs);
  const feedback = listFeedback(sinceTs);

  const points = new Map<string, UsagePoint & { visitors: Set<string> }>();
  const daily = new Map<
    string,
    { date: string; scans: number; usageMs: number; sessionIds: Set<string> }
  >();
  const installs = new Set<string>();
  /**
   * แอปส่ง event มาหนึ่งใบต่อ "หนึ่งช่วงที่อยู่หน้าจอ" — สลับออกไปรับสายแล้วกลับมา
   * จะได้สองใบที่ sessionId เดียวกัน จึงนับจำนวนครั้งจาก sessionId ที่ไม่ซ้ำ
   * แต่บวกเวลาจากทุกใบ ไม่งั้นการใช้งานรอบเดียวจะกลายเป็นหลายครั้ง
   */
  const sessionIds = new Set<string>();

  let scans = 0;
  let usageMs = 0;

  for (const event of events) {
    installs.add(event.installId);

    const key = dateKey(event.ts);
    const day = daily.get(key) ?? { date: key, scans: 0, usageMs: 0, sessionIds: new Set<string>() };
    daily.set(key, day);

    if (event.kind === "session") {
      sessionIds.add(event.sessionId);
      usageMs += event.durationMs;
      day.sessionIds.add(event.sessionId);
      day.usageMs += event.durationMs;
      continue;
    }

    scans += 1;
    day.scans += 1;

    const point = points.get(event.deviceId) ?? {
      deviceId: event.deviceId,
      label: event.label,
      location: event.location,
      arucoId: event.arucoId,
      scans: 0,
      uniqueVisitors: 0,
      totalDwellMs: 0,
      avgDwellMs: 0,
      lastScanAt: 0,
      visitors: new Set<string>(),
    };

    point.scans += 1;
    point.totalDwellMs += event.dwellMs;
    point.visitors.add(event.installId);
    point.lastScanAt = Math.max(point.lastScanAt, event.ts);
    // ป้ายชื่อกับตำแหน่งแก้ใน markers.json ทีหลังได้ ใช้ค่าจาก event ล่าสุดเสมอ
    point.label = event.label;
    point.location = event.location ?? point.location;
    point.arucoId = event.arucoId ?? point.arucoId;
    points.set(event.deviceId, point);
  }

  const tagCounts = new Map<string, number>();
  let ratingSum = 0;
  let ratingCount = 0;

  for (const entry of feedback) {
    if (entry.rating !== null) {
      ratingSum += entry.rating;
      ratingCount += 1;
    }
    for (const tag of entry.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  const sessions = sessionIds.size;

  return {
    generatedAt: Date.now(),
    sinceTs: sinceTs ?? null,
    totals: {
      scans,
      sessions,
      usageMs,
      installs: installs.size,
      avgSessionMs: sessions > 0 ? Math.round(usageMs / sessions) : 0,
      feedback: feedback.length,
      avgRating: ratingCount > 0 ? ratingSum / ratingCount : null,
    },
    points: [...points.values()]
      .map(({ visitors, ...point }) => ({
        ...point,
        uniqueVisitors: visitors.size,
        avgDwellMs: point.scans > 0 ? Math.round(point.totalDwellMs / point.scans) : 0,
      }))
      .sort((a, b) => b.scans - a.scans),
    daily: [...daily.values()]
      .map(({ sessionIds: ids, ...day }) => ({ ...day, sessions: ids.size }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    tagCounts: [...tagCounts.entries()]
      .map(([tag, tagCount]) => ({ tag, count: tagCount }))
      .sort((a, b) => b.count - a.count),
    feedback: feedback.slice(0, FEEDBACK_PAGE),
  };
}
