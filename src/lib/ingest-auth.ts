import "server-only";
import { NextResponse } from "next/server";
import { ingestToken } from "@/lib/config";

/**
 * ตรวจ token ของคำขอที่ "เขียน" ข้อมูลเข้าระบบ (usage กับ feedback)
 *
 * dashboard ไม่มีระบบล็อกอิน พอเปิดออกอินเทอร์เน็ตให้คนอื่นลองใช้แอป
 * ใครก็ยิงข้อมูลปลอมเข้ามาได้ จึงให้แอปแนบ token มาด้วยทุกครั้ง
 * ส่วนคำขออ่าน (ค่าเซนเซอร์ พยากรณ์อากาศ) ยังเปิดตามเดิม เพราะหน้าเว็บเองก็ต้องใช้
 *
 * ไม่ได้ตั้ง AR_INGEST_TOKEN ไว้ = ไม่ตรวจ ให้ผ่านหมด (โหมด dev ในวง LAN)
 */
export function rejectUnauthorized(request: Request): NextResponse | null {
  if (ingestToken === "") return null;

  const sent = request.headers.get("x-ar-token")?.trim() ?? "";
  if (sent === ingestToken) return null;

  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
