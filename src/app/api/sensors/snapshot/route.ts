import { NextResponse } from "next/server";
import { alertThresholds } from "@/lib/config";
import { ensureBroker } from "@/lib/mqtt/ensure";
import { sensorStore } from "@/lib/mqtt/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** สถานะ + ประวัติล่าสุด สำหรับตอนโหลดหน้าครั้งแรกหรือเมื่อ SSE หลุด */
export async function GET(request: Request) {
  await ensureBroker();

  const points = Number(new URL(request.url).searchParams.get("points") ?? 300);

  return NextResponse.json({
    ...sensorStore.snapshot(Number.isFinite(points) ? points : 300),
    thresholds: alertThresholds,
  });
}
