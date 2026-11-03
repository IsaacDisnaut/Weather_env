import { NextResponse } from "next/server";
import { rejectUnauthorized } from "@/lib/ingest-auth";
import { DEFAULT_COUNT, MAX_COUNT, buildQuiz, gradeQuiz, newSeed } from "@/lib/quiz/generate";
import { recordResult } from "@/lib/quiz/store";
import type { QuizLang, QuizResult, QuizSet } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * เกมตอบคำถามที่เล่นผ่าน marker ของแอป AR
 *
 *   GET   ขอชุดคำถามใหม่
 *   POST  ส่งคำตอบกลับมาให้ตรวจและบันทึก
 *
 * คำถามสร้างจาก seed เดียว แอปจึงส่งแค่ seed กับตัวเลือกที่กดกลับมา
 * แล้วเซิร์ฟเวอร์สร้างชุดเดิมขึ้นใหม่เพื่อตรวจเอง คะแนนที่เก็บจึงเชื่อถือได้
 * ถึงจะมีคนแก้แอปแล้วส่งคะแนนเต็มเข้ามาก็ตาม
 */

function langFrom(value: string | null): QuizLang {
  return value === "en" ? "en" : "th";
}

function countFrom(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.round(parsed), MAX_COUNT);
}

/** ?lang=th&count=5 — ใส่ &seed=123 ได้ถ้าอยากได้ชุดเดิมซ้ำ (ไว้ทดสอบ) */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lang = langFrom(params.get("lang"));
  const count = countFrom(params.get("count"), DEFAULT_COUNT);

  const requested = Number(params.get("seed"));
  const seed = Number.isInteger(requested) && requested >= 0 ? requested >>> 0 : newSeed();

  const { questions } = buildQuiz(lang, count, seed);

  const body: QuizSet = { seed, lang, count, questions };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}

/** รับผลการเล่นจากแอป — ตรวจคะแนนใหม่ฝั่งเซิร์ฟเวอร์เสมอ */
export async function POST(request: Request) {
  const denied = rejectUnauthorized(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const installId = typeof body.installId === "string" ? body.installId.slice(0, 64) : "";
  const chosen = Array.isArray(body.answers)
    ? body.answers.map((value) => (Number.isInteger(value) ? (value as number) : -1))
    : null;

  if (installId === "" || !chosen) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const seed = Number(body.seed);
  if (!Number.isInteger(seed) || seed < 0) {
    return NextResponse.json({ ok: false, error: "invalid seed" }, { status: 400 });
  }

  const lang = body.lang === "en" ? "en" : "th";
  const count = countFrom(body.count, chosen.length || DEFAULT_COUNT);
  const graded = gradeQuiz(lang, count, seed >>> 0, chosen);

  if (graded.total === 0) {
    return NextResponse.json({ ok: false, error: "empty quiz" }, { status: 400 });
  }

  /**
   * จำนวนคำตอบต้องเท่ากับจำนวนข้อของชุดที่สร้างใหม่จาก seed
   *
   * ไม่เท่ากันแปลว่าฝั่งแอปกับเซิร์ฟเวอร์เข้าใจ count ไม่ตรงกัน ชุดคำถามที่เอามาตรวจ
   * จึงเป็นคนละชุดกับที่ผู้เล่นเห็น ถ้าปล่อยผ่านจะได้คะแนนที่ดูสมเหตุสมผลแต่ผิด
   * และคำตอบข้อท้ายจะหล่นหาย — พังแบบเงียบ ๆ ที่หาเจอยากที่สุด จึงตีกลับไปเลย
   */
  if (chosen.length !== graded.questionCount) {
    return NextResponse.json(
      {
        ok: false,
        error: "answer count mismatch",
        expected: graded.questionCount,
        received: chosen.length,
      },
      { status: 400 },
    );
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  const entry: QuizResult = {
    id:
      typeof body.id === "string" && body.id.trim() !== ""
        ? body.id.slice(0, 64)
        : `quiz-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    ts: Date.now(),
    installId,
    sessionId: sessionId === "" ? null : sessionId,
    lang,
    appVersion: typeof body.appVersion === "string" ? body.appVersion.slice(0, 32) : "",
    seed: seed >>> 0,
    total: graded.total,
    correct: graded.correct,
    durationMs: Number.isFinite(Number(body.durationMs)) ? Math.max(0, Number(body.durationMs)) : 0,
    answers: graded.answers,
    conservation: graded.conservation,
  };

  const saved = recordResult(entry);

  // ส่งคะแนนที่เซิร์ฟเวอร์ตรวจกลับไป แอปจะได้แสดงผลตรงกับที่บันทึกจริง
  return NextResponse.json({
    ok: true,
    duplicate: saved === null,
    total: graded.total,
    correct: graded.correct,
    answers: graded.answers.map((answer) => answer.correct),
    conservation: graded.conservation,
  });
}
