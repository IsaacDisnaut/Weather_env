import { NextResponse } from "next/server";
import {
  addDevice,
  listDevices,
  removeDevice,
  suggestNextId,
} from "@/lib/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    devices: listDevices(),
    suggestion: suggestNextId(),
  });
}

/** เพิ่มอุปกรณ์ใหม่ ชื่อที่ตั้งจะกลายเป็น topic sensors/<ชื่อ>/data */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    label?: string;
  };

  if (typeof body.id !== "string") {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = addDevice(body.id, body.label);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "duplicate" ? 409 : 400 });
  }

  return NextResponse.json({
    ok: true,
    device: result.device,
    devices: listDevices(),
    suggestion: suggestNextId(),
  });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const removed = removeDevice(id);
  return NextResponse.json({
    ok: removed,
    devices: listDevices(),
    suggestion: suggestNextId(),
  });
}
