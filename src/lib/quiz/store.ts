import "server-only";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import type {
  QuizQuestionStat,
  QuizResult,
  QuizSummary,
  QuizTopic,
} from "@/lib/types";

/**
 * เก็บผลการเล่นเกมตอบคำถาม
 *
 * ใช้ JSON Lines ต่อท้ายไฟล์แบบเดียวกับ usage-events.jsonl ด้วยเหตุผลเดียวกัน —
 * ผลการเล่นเป็น event ที่เขียนครั้งเดียวไม่เคยแก้ การเขียนแบบ append จึงไม่ต้อง
 * อ่านไฟล์ทั้งก้อนก่อน และถ้าไฟล์พังบางบรรทัดก็ยังอ่านบรรทัดที่เหลือได้
 */

const RESULTS_PATH = join(process.cwd(), "data", "quiz-results.jsonl");

const MAX_LINES = 50_000;
const DEDUPE_WINDOW = 5_000;
/** จำนวนผลการเล่นล่าสุดที่ส่งไปให้หน้า dashboard */
const RECENT_PAGE = 20;
/** จำนวนคำถามที่เอามาโชว์ในตาราง "ข้อที่ตอบผิดบ่อย" */
const HARDEST_PAGE = 8;

const ONE_DAY_MS = 86_400_000;

function readLines(path: string): string[] {
  try {
    return readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "");
  } catch {
    // ยังไม่มีใครเล่น
    return [];
  }
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

// ---------- ตรวจรูปแบบตอนอ่านกลับ ----------

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function count(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.round(parsed), max);
}

function acceptResult(raw: unknown): QuizResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const id = text(value.id, 64);
  const installId = text(value.installId, 64);
  if (id === "" || installId === "") return null;

  const total = count(value.total, 100);
  if (total === 0) return null;

  const answers = Array.isArray(value.answers)
    ? value.answers.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [];
        const answer = item as Record<string, unknown>;
        const questionId = text(answer.questionId, 96);
        if (questionId === "") return [];
        const chosen = Number(answer.chosenIndex);
        return [
          {
            questionId,
            topic: text(answer.topic, 32) as QuizTopic,
            chosenIndex: Number.isInteger(chosen) ? chosen : -1,
            correct: answer.correct === true,
          },
        ];
      })
    : [];

  const sessionId = text(value.sessionId, 64);

  // 0–5 เท่านั้น ค่าอื่นถือว่าไม่ได้ตอบ จะได้ไม่ไปถ่วงค่าเฉลี่ย
  //
  // ต้องเช็ก typeof ก่อน ห้ามใช้ Number() ดื้อ ๆ เพราะ Number(null) ได้ 0 ไม่ใช่ NaN
  // คนที่ข้ามข้อนี้จะถูกบันทึกเป็น "ไม่เลย" แล้วค่าเฉลี่ยจะต่ำกว่าความจริง
  const rating = value.conservation;
  const conservation =
    typeof rating === "number" && Number.isInteger(rating) && rating >= 0 && rating <= 5
      ? rating
      : null;

  return {
    id,
    ts: count(value.ts, Number.MAX_SAFE_INTEGER) || Date.now(),
    installId,
    sessionId: sessionId === "" ? null : sessionId,
    lang: value.lang === "en" ? "en" : "th",
    appVersion: text(value.appVersion, 32),
    seed: count(value.seed, 0xffffffff),
    total,
    correct: Math.min(count(value.correct, 100), total),
    durationMs: count(value.durationMs, ONE_DAY_MS),
    answers,
    conservation,
  };
}

// ---------- เขียน ----------

/** บันทึกผลหนึ่งรอบ คืน null ถ้าเป็นรายการซ้ำหรือรูปแบบผิด */
export function recordResult(entry: QuizResult): QuizResult | null {
  const accepted = acceptResult(entry);
  if (!accepted) return null;
  if (recentIds(RESULTS_PATH).has(accepted.id)) return null;

  append(RESULTS_PATH, [accepted]);
  return accepted;
}

// ---------- อ่าน ----------

export function listResults(sinceTs?: number): QuizResult[] {
  const results: QuizResult[] = [];
  for (const line of readLines(RESULTS_PATH)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const result = acceptResult(parsed);
    if (result && (!sinceTs || result.ts >= sinceTs)) results.push(result);
  }
  return results.sort((a, b) => b.ts - a.ts);
}

/** ใช้เวลาท้องถิ่นของเซิร์ฟเวอร์ เพราะคนอ่านรายงานคิด "วันนี้" ตามเวลาหน้างาน */
function dateKey(ts: number): string {
  const date = new Date(ts);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function summarizeQuiz(sinceTs?: number): QuizSummary {
  const results = listResults(sinceTs);

  const players = new Set<string>();
  const spread = new Map<number, number>();
  const perQuestion = new Map<string, QuizQuestionStat>();
  const daily = new Map<string, { date: string; plays: number; correct: number; asked: number }>();

  const conservationSpread = new Map<number, number>();

  let questionsAnswered = 0;
  let correct = 0;
  let durationMs = 0;
  let perfect = 0;
  let conservationSum = 0;
  let conservationResponses = 0;

  for (const result of results) {
    players.add(result.installId);
    questionsAnswered += result.total;
    correct += result.correct;
    durationMs += result.durationMs;
    if (result.total > 0 && result.correct === result.total) perfect += 1;

    spread.set(result.correct, (spread.get(result.correct) ?? 0) + 1);

    if (result.conservation !== null) {
      conservationSum += result.conservation;
      conservationResponses += 1;
      conservationSpread.set(
        result.conservation,
        (conservationSpread.get(result.conservation) ?? 0) + 1,
      );
    }

    const key = dateKey(result.ts);
    const day = daily.get(key) ?? { date: key, plays: 0, correct: 0, asked: 0 };
    day.plays += 1;
    day.correct += result.correct;
    day.asked += result.total;
    daily.set(key, day);

    for (const answer of result.answers) {
      const stat = perQuestion.get(answer.questionId) ?? {
        questionId: answer.questionId,
        topic: answer.topic,
        asked: 0,
        correct: 0,
        accuracy: 0,
      };
      stat.asked += 1;
      if (answer.correct) stat.correct += 1;
      perQuestion.set(answer.questionId, stat);
    }
  }

  const plays = results.length;

  return {
    generatedAt: Date.now(),
    sinceTs: sinceTs ?? null,
    totals: {
      plays,
      players: players.size,
      questionsAnswered,
      correct,
      accuracy: questionsAnswered > 0 ? correct / questionsAnswered : 0,
      avgScore: plays > 0 ? correct / plays : 0,
      avgDurationMs: plays > 0 ? Math.round(durationMs / plays) : 0,
      perfect,
      conservationAvg:
        conservationResponses > 0 ? conservationSum / conservationResponses : null,
      conservationResponses,
    },
    scoreSpread: [...spread.entries()]
      .map(([score, playCount]) => ({ score, plays: playCount }))
      .sort((a, b) => a.score - b.score),
    // แสดงครบทั้ง 0–5 เสมอ ระดับที่ไม่มีใครเลือกก็ต้องเห็นว่าเป็นศูนย์
    conservationSpread: [0, 1, 2, 3, 4, 5].map((score) => ({
      score,
      responses: conservationSpread.get(score) ?? 0,
    })),
    hardest: [...perQuestion.values()]
      .map((stat) => ({ ...stat, accuracy: stat.asked > 0 ? stat.correct / stat.asked : 0 }))
      // เรียงจากข้อที่ตอบถูกน้อยที่สุด ข้อที่ถูกถามบ่อยกว่าขึ้นก่อนเมื่อเปอร์เซ็นต์เท่ากัน
      .sort((a, b) => a.accuracy - b.accuracy || b.asked - a.asked)
      .slice(0, HARDEST_PAGE),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    recent: results.slice(0, RECENT_PAGE),
  };
}
