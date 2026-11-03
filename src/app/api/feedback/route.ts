import { NextResponse } from "next/server";
import { listFeedback, recordFeedback } from "@/lib/usage";
import { rejectUnauthorized } from "@/lib/ingest-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const entries = listFeedback();

  return NextResponse.json(
    {
      feedback: entries.slice(0, Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100),
      total: entries.length,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** รับ feedback จากแอป AR — ฟอร์มที่ไม่มีทั้งดาว ข้อความ และแท็ก จะถูกปฏิเสธ */
export async function POST(request: Request) {
  const denied = rejectUnauthorized(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const entry = recordFeedback(body);

  if (!entry) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: entry.id });
}
