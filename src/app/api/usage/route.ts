import { NextResponse } from "next/server";
import { recordEvents, summarize } from "@/lib/usage";
import { rejectUnauthorized } from "@/lib/ingest-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?days=7 = ดูย้อนหลัง 7 วัน ไม่ใส่ = ตั้งแต่เริ่มเก็บ */
function sinceFrom(url: string): number | undefined {
  const days = Number(new URL(url).searchParams.get("days") ?? 0);
  return Number.isFinite(days) && days > 0 ? Date.now() - days * 86_400_000 : undefined;
}

/** สรุปการใช้งานให้หน้า dashboard */
export async function GET(request: Request) {
  return NextResponse.json(summarize(sinceFrom(request.url)), {
    headers: { "cache-control": "no-store" },
  });
}

/**
 * รับ event จากแอป AR ทีละชุด
 *
 * แอปเก็บ event ไว้ในเครื่องก่อนแล้วค่อยส่งเป็นชุด จึงต้องรับซ้ำได้โดยไม่นับซ้ำ —
 * ตัวกันซ้ำอยู่ที่ recordEvents() ซึ่งดูจาก id ที่แอปสร้างมาให้
 */
export async function POST(request: Request) {
  const denied = rejectUnauthorized(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { events?: unknown } | null;
  const events = Array.isArray(body?.events) ? body.events : null;

  if (!events) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = recordEvents(events);
  return NextResponse.json({ ok: true, ...result });
}
