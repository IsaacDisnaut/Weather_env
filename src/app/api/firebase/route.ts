import { NextResponse } from "next/server";
import { firebaseStatus } from "@/lib/firebase";
import { ensureBroker } from "@/lib/mqtt/ensure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** สถานะการส่งค่าขึ้น Firebase — ไว้เช็กว่าส่งผ่านไหม / error อะไร */
export async function GET() {
  await ensureBroker();
  return NextResponse.json(firebaseStatus());
}
