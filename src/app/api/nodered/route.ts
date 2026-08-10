import { NextResponse } from "next/server";
import { ensureBroker } from "@/lib/mqtt/ensure";
import { sensorStore } from "@/lib/mqtt/store";
import { markManualSend, noderedStatus, postToNodeRed } from "@/lib/nodered";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBroker();
  return NextResponse.json(noderedStatus());
}

/** ส่งข้อมูลใน buffer ไป Node-RED ทันที (ปุ่มบนแดชบอร์ด) */
export async function POST(request: Request) {
  await ensureBroker();

  const body = (await request.json().catch(() => ({}))) as { minutes?: number };
  const minutes = Number(body.minutes ?? 0);
  const sinceTs =
    Number.isFinite(minutes) && minutes > 0 ? Date.now() - minutes * 60_000 : undefined;

  const readings = sensorStore.allReadings(sinceTs);
  if (readings.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  try {
    await postToNodeRed(readings);
    markManualSend(readings.length);
    return NextResponse.json({ ok: true, sent: readings.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
