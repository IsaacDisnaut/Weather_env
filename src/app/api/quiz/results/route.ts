import { NextResponse } from "next/server";
import { summarizeQuiz } from "@/lib/quiz/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?days=7 = ดูย้อนหลัง 7 วัน ไม่ใส่ = ตั้งแต่เริ่มเก็บ */
function sinceFrom(url: string): number | undefined {
  const days = Number(new URL(url).searchParams.get("days") ?? 0);
  return Number.isFinite(days) && days > 0 ? Date.now() - days * 86_400_000 : undefined;
}

/** สรุปผลเกมตอบคำถามให้หน้า dashboard */
export async function GET(request: Request) {
  return NextResponse.json(summarizeQuiz(sinceFrom(request.url)), {
    headers: { "cache-control": "no-store" },
  });
}
