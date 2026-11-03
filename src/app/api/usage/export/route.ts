import { listEvents, listFeedback } from "@/lib/usage";

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
 * ดาวน์โหลดบันทึกการใช้งานเป็น CSV เปิดด้วย Excel ได้ทันที
 *
 *   ?what=scans     การสแกนรายครั้ง (ค่าตั้งต้น)
 *   ?what=sessions  การเปิดใช้งานแต่ละครั้ง
 *   ?what=feedback  feedback ที่ผู้ใช้ส่งมา
 *   ?days=7         จำกัดช่วงเวลา
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const what = params.get("what") ?? "scans";
  const days = Number(params.get("days") ?? 0);
  const sinceTs = Number.isFinite(days) && days > 0 ? Date.now() - days * 86_400_000 : undefined;

  let header: string[];
  let rows: (string | number | null)[][];

  if (what === "feedback") {
    header = [
      "timestamp",
      "epoch_ms",
      "rating",
      "tags",
      "message",
      "point",
      "device",
      "contact",
      "session_seconds",
      "scan_count",
      "lang",
      "install_id",
    ];
    rows = listFeedback(sinceTs).map((entry) => [
      new Date(entry.ts).toISOString(),
      entry.ts,
      entry.rating,
      entry.tags.join(" | "),
      entry.message,
      entry.deviceLabel,
      entry.deviceId,
      entry.contact,
      seconds(entry.sessionMs),
      entry.scanCount,
      entry.lang,
      entry.installId,
    ]);
  } else if (what === "sessions") {
    header = [
      "timestamp",
      "epoch_ms",
      "duration_seconds",
      "scan_count",
      "lang",
      "app_version",
      "install_id",
      "session_id",
    ];
    rows = listEvents(sinceTs)
      .filter((event) => event.kind === "session")
      .map((event) => [
        new Date(event.ts).toISOString(),
        event.ts,
        seconds(event.durationMs),
        event.scanCount,
        event.lang,
        event.appVersion,
        event.installId,
        event.sessionId,
      ]);
  } else {
    header = [
      "timestamp",
      "epoch_ms",
      "device",
      "point",
      "location",
      "aruco_id",
      "dwell_seconds",
      "lang",
      "install_id",
      "session_id",
    ];
    rows = listEvents(sinceTs)
      .filter((event) => event.kind === "scan")
      .map((event) => [
        new Date(event.ts).toISOString(),
        event.ts,
        event.deviceId,
        event.label,
        event.location,
        event.arucoId,
        seconds(event.dwellMs),
        event.lang,
        event.installId,
        event.sessionId,
      ]);
  }

  const lines = [header.join(","), ...rows.map((row) => row.map(csvCell).join(","))];

  // BOM เพื่อให้ Excel อ่านภาษาไทยเป็น UTF-8 ถูกต้อง
  const body = `﻿${lines.join("\r\n")}\r\n`;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ar-${what}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
