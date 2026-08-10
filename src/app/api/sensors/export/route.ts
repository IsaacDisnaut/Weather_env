import { siteConfig } from "@/lib/config";
import { ensureBroker } from "@/lib/mqtt/ensure";
import { sensorStore } from "@/lib/mqtt/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * ดาวน์โหลดข้อมูลใน buffer เป็น CSV ที่เปิดด้วย Excel ได้ทันที
 * (เส้นทางหลักของรายงานคือ Node-RED — อันนี้ไว้ดึงเร็ว ๆ จากหน้าเว็บ)
 */
export async function GET(request: Request) {
  await ensureBroker();

  const minutes = Number(new URL(request.url).searchParams.get("minutes") ?? 0);
  const sinceTs =
    Number.isFinite(minutes) && minutes > 0 ? Date.now() - minutes * 60_000 : undefined;

  const rows = sensorStore.allReadings(sinceTs);
  const header = ["timestamp", "epoch_ms", "site", "device", "metric", "value", "topic"];

  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        new Date(row.ts).toISOString(),
        row.ts,
        siteConfig.name,
        row.deviceId,
        row.metric,
        row.value,
        row.topic,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];

  // BOM เพื่อให้ Excel อ่านภาษาไทยเป็น UTF-8 ถูกต้อง
  const body = `﻿${lines.join("\r\n")}\r\n`;
  const filename = `sensor-readings-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
