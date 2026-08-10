import "server-only";
import { noderedConfig, siteConfig } from "@/lib/config";
import { sensorStore } from "@/lib/mqtt/store";
import type { Reading } from "@/lib/types";

export type NodeRedStatus = {
  enabled: boolean;
  url: string;
  /** จำนวน reading ที่ยังรอส่ง */
  queued: number;
  /** จำนวน reading ที่ส่งสำเร็จแล้ว */
  sentCount: number;
  /** จำนวน "ครั้ง" ที่ส่งไม่สำเร็จ (ข้อมูลชุดเดิมจะถูกลองใหม่รอบถัดไป) */
  failedCount: number;
  lastSentAt: number | null;
  lastError: string | null;
};

type ForwarderState = {
  queue: Reading[];
  timer: NodeJS.Timeout | null;
  sentCount: number;
  failedCount: number;
  lastSentAt: number | null;
  lastError: string | null;
  started: boolean;
  flushing: boolean;
};

const globalRef = globalThis as typeof globalThis & {
  __noderedForwarder?: ForwarderState;
};

const state: ForwarderState = (globalRef.__noderedForwarder ??= {
  queue: [],
  timer: null,
  sentCount: 0,
  failedCount: 0,
  lastSentAt: null,
  lastError: null,
  started: false,
  flushing: false,
});

export function noderedPayload(readings: Reading[]) {
  return {
    site: siteConfig.name,
    lat: siteConfig.lat,
    lon: siteConfig.lon,
    sentAt: new Date().toISOString(),
    count: readings.length,
    readings: readings.map((reading) => ({
      timestamp: new Date(reading.ts).toISOString(),
      epoch: reading.ts,
      device: reading.deviceId,
      metric: reading.metric,
      value: reading.value,
      topic: reading.topic,
    })),
  };
}

/** ส่งชุดข้อมูลไป Node-RED ครั้งเดียว (ใช้ทั้งจาก forwarder และปุ่ม "ส่งเดี๋ยวนี้") */
export async function postToNodeRed(readings: Reading[]): Promise<void> {
  if (!noderedConfig.url) throw new Error("NODERED_URL is not configured");
  if (readings.length === 0) return;

  const response = await fetch(noderedConfig.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(noderedConfig.token
        ? { authorization: `Bearer ${noderedConfig.token}` }
        : {}),
    },
    body: JSON.stringify(noderedPayload(readings)),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Node-RED responded ${response.status} ${response.statusText}`);
  }
}

/** ระบายคิวจนหมด (หลาย batch ต่อรอบ) เพื่อให้ตามทันหลัง Node-RED กลับมา */
async function flush(): Promise<void> {
  if (state.flushing) return;
  state.flushing = true;

  try {
    // จำกัดจำนวน batch ต่อรอบ กัน loop ยาวเกินไปถ้าข้อมูลไหลเข้าเร็วมาก
    for (let attempt = 0; attempt < 20 && state.queue.length > 0; attempt += 1) {
      const batch = state.queue.splice(0, noderedConfig.batchSize);
      try {
        await postToNodeRed(batch);
        state.sentCount += batch.length;
        state.lastSentAt = Date.now();
        state.lastError = null;
      } catch (error) {
        state.failedCount += 1;
        state.lastError = error instanceof Error ? error.message : String(error);
        // ใส่กลับหัวคิวเพื่อลองใหม่รอบหน้า แต่ไม่ให้คิวโตไม่จำกัดถ้า Node-RED ล่มยาว
        state.queue.unshift(...batch);
        const overflow = state.queue.length - noderedConfig.batchSize * 10;
        if (overflow > 0) state.queue.splice(0, overflow);
        break;
      }
    }
  } finally {
    state.flushing = false;
  }
}

/** เริ่มดักฟังค่าจาก MQTT แล้วทยอยส่งเข้า Node-RED เป็นชุด */
export function startNodeRedForwarder(): void {
  if (state.started) return;
  state.started = true;

  sensorStore.bus.on("reading", (reading: Reading) => {
    if (!noderedConfig.enabled || !noderedConfig.url) return;
    state.queue.push(reading);
  });

  state.timer = setInterval(() => {
    if (!noderedConfig.enabled || !noderedConfig.url) return;
    void flush();
  }, noderedConfig.flushMs);

  // ไม่ให้ interval กัน process ไม่ให้ปิด
  state.timer.unref?.();
}

export function noderedStatus(): NodeRedStatus {
  return {
    enabled: noderedConfig.enabled && Boolean(noderedConfig.url),
    url: noderedConfig.url,
    queued: state.queue.length,
    sentCount: state.sentCount,
    failedCount: state.failedCount,
    lastSentAt: state.lastSentAt,
    lastError: state.lastError,
  };
}

export function markManualSend(count: number): void {
  state.sentCount += count;
  state.lastSentAt = Date.now();
  state.lastError = null;
}
