import { METRICS, type Metric, type Reading } from "@/lib/types";

/** คำที่ยอมรับได้สำหรับแต่ละ metric ทั้งใน topic และใน key ของ JSON payload */
const ALIASES: Record<Metric, string[]> = {
  temperature: ["temperature", "temp", "tempc", "temperature_c", "t"],
  humidity: ["humidity", "humi", "hum", "rh", "relative_humidity", "h"],
  vibration: ["vibration", "vibe", "vib", "accel", "acceleration", "shock", "v"],
  light: ["light", "ldr", "lux", "illuminance", "brightness", "luminosity", "l"],
  uv: ["uv", "uvi", "uvindex", "uv_index", "ultraviolet"],
  co2: ["co2", "eco2", "carbondioxide", "carbon_dioxide", "ppm"],
};

const DEVICE_KEYS = ["deviceid", "device_id", "device", "id", "sensor", "node"];
const TIME_KEYS = ["ts", "timestamp", "time", "datetime", "date"];
/** segment ใน topic ที่เป็นแค่คำนำหน้า ไม่ใช่ชื่ออุปกรณ์ */
const TOPIC_NOISE = new Set([
  "sensor",
  "sensors",
  "data",
  "value",
  "state",
  "telemetry",
  "readings",
  "reading",
  "measurement",
  "+",
  "#",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s_-]/g, "");
}

function matchMetric(text: string): Metric | null {
  const key = normalize(text);
  for (const metric of METRICS) {
    if (ALIASES[metric].some((alias) => normalize(alias) === key)) return metric;
  }
  // เผื่อ topic แบบ "temperature_outdoor" หรือ key "tempC"
  for (const metric of METRICS) {
    if (ALIASES[metric].some((alias) => alias.length > 2 && key.includes(alias))) {
      return metric;
    }
  }
  return null;
}

function metricFromTopic(topic: string): Metric | null {
  const segments = topic.split("/").filter(Boolean);
  // อ่านจากท้ายมาหน้า เพราะ metric มักอยู่ segment สุดท้าย
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const metric = matchMetric(segments[i]);
    if (metric) return metric;
  }
  return null;
}

function deviceFromTopic(topic: string): string {
  const segments = topic.split("/").filter(Boolean);
  const candidates = segments.filter(
    (segment) => !TOPIC_NOISE.has(segment.toLowerCase()) && !matchMetric(segment),
  );
  return candidates.at(-1) ?? segments[0] ?? "unknown";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // payload บางตัวส่งเป็นวินาที บางตัวเป็นมิลลิวินาที
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && value.trim() !== "") return toTimestamp(asNumber);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * บอร์ดที่ไม่ได้ sync NTP มักส่ง millis() มาเป็น ts ทำให้เวลาตกไปปี 1970
 * แล้วกราฟกรองจุดพวกนี้ทิ้งจนไม่เหลืออะไรวาด — เวลาที่หลุดช่วงจึงถือว่าใช้ไม่ได้
 * แล้วไปใช้เวลาที่เซิร์ฟเวอร์รับแทน
 */
const MAX_CLOCK_LAG_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_LEAD_MS = 60 * 60 * 1000;

function plausibleTimestamp(ts: number | null, now: number): number | null {
  if (ts === null) return null;
  if (ts < now - MAX_CLOCK_LAG_MS || ts > now + MAX_CLOCK_LEAD_MS) return null;
  return ts;
}

function findKey(record: Record<string, unknown>, keys: string[]): unknown {
  for (const [rawKey, value] of Object.entries(record)) {
    if (keys.includes(normalize(rawKey))) return value;
  }
  return undefined;
}

/**
 * แปลง MQTT message เป็น Reading ได้หลายรูปแบบ:
 *   sensors/temperature            -> "27.4"
 *   sensors/node1/humidity         -> {"value": 61}
 *   sensors/node1/data             -> {"temperature":27.4,"humidity":61,"vibration":0.2,"ts":...}
 * ถ้าอ่านไม่ออกจะคืน array ว่างแทนการ throw เพื่อไม่ให้ subscriber ล้ม
 */
export function parseMessage(topic: string, payload: Buffer): Reading[] {
  const raw = payload.toString("utf8").trim();
  if (!raw) return [];

  const topicMetric = metricFromTopic(topic);
  const fallbackDevice = deviceFromTopic(topic);
  const now = Date.now();

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && raw !== "") {
    if (!topicMetric) return [];
    return [
      {
        ts: now,
        metric: topicMetric,
        value: asNumber,
        deviceId: fallbackDevice,
        topic,
      },
    ];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed === "number") {
    return topicMetric
      ? [{ ts: now, metric: topicMetric, value: parsed, deviceId: fallbackDevice, topic }]
      : [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const record = parsed as Record<string, unknown>;
  const deviceRaw = findKey(record, DEVICE_KEYS);
  const deviceId =
    typeof deviceRaw === "string" || typeof deviceRaw === "number"
      ? String(deviceRaw)
      : fallbackDevice;
  const ts = plausibleTimestamp(toTimestamp(findKey(record, TIME_KEYS)), now) ?? now;

  const readings: Reading[] = [];

  for (const [key, value] of Object.entries(record)) {
    const metric = matchMetric(key);
    if (!metric) continue;
    const numeric = toNumber(value);
    if (numeric === null) continue;
    readings.push({ ts, metric, value: numeric, deviceId, topic });
  }

  // payload แบบ {"value": 27.4} ที่ metric มาจาก topic
  if (readings.length === 0 && topicMetric) {
    const numeric = toNumber(findKey(record, ["value", "val", "reading", "data"]));
    if (numeric !== null) {
      readings.push({ ts, metric: topicMetric, value: numeric, deviceId, topic });
    }
  }

  return readings;
}
