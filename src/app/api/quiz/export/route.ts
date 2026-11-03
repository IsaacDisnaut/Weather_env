import { listResults } from "@/lib/quiz/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

/**
 * ดาวน์โหลดผลเกมตอบคำถามเป็น CSV เปิดด้วย Excel ได้ทันที
 *
 *   ?what=plays      ผลรายรอบที่เล่น (ค่าตั้งต้น)
 *   ?what=questions  สถิติรายข้อ ว่าข้อไหนถูกถามกี่ครั้งและตอบถูกกี่ครั้ง
 *   ?days=7          จำกัดช่วงเวลา
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const what = params.get("what") ?? "plays";
  const days = Number(params.get("days") ?? 0);
  const sinceTs = Number.isFinite(days) && days > 0 ? Date.now() - days * 86_400_000 : undefined;

  let header: string[];
  let rows: (string | number | null)[][];

  if (what === "questions") {
    header = ["question_id", "topic", "asked", "correct", "accuracy_percent"];
    // summarizeQuiz ตัดให้เหลือเฉพาะข้อที่ยากสุดไว้โชว์บนหน้าจอ แต่ไฟล์ CSV ควรได้ครบทุกข้อ
    const stats = new Map<string, { topic: string; asked: number; correct: number }>();
    for (const result of listResults(sinceTs)) {
      for (const answer of result.answers) {
        const stat = stats.get(answer.questionId) ?? {
          topic: answer.topic,
          asked: 0,
          correct: 0,
        };
        stat.asked += 1;
        if (answer.correct) stat.correct += 1;
        stats.set(answer.questionId, stat);
      }
    }
    rows = [...stats.entries()]
      .sort((a, b) => a[1].correct / a[1].asked - b[1].correct / b[1].asked)
      .map(([questionId, stat]) => [
        questionId,
        stat.topic,
        stat.asked,
        stat.correct,
        stat.asked > 0 ? Math.round((stat.correct / stat.asked) * 100) : 0,
      ]);
  } else {
    header = [
      "timestamp",
      "epoch_ms",
      "score",
      "total",
      "percent",
      "conservation_0_5",
      "duration_seconds",
      "lang",
      "app_version",
      "install_id",
      "session_id",
      "seed",
    ];
    rows = listResults(sinceTs).map((result) => [
      new Date(result.ts).toISOString(),
      result.ts,
      result.correct,
      result.total,
      result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0,
      result.conservation,
      seconds(result.durationMs),
      result.lang,
      result.appVersion,
      result.installId,
      result.sessionId,
      result.seed,
    ]);
  }

  const lines = [header.join(","), ...rows.map((row) => row.map(csvCell).join(","))];

  // BOM เพื่อให้ Excel อ่านภาษาไทยเป็น UTF-8 ถูกต้อง
  const body = `﻿${lines.join("\r\n")}\r\n`;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="quiz-${what}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
