/** อ่านค่า config ทั้งหมดจาก environment ที่เดียว เพื่อให้เปลี่ยน broker/topic ทีหลังได้ง่าย */

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() !== "false" && value !== "0";
}

/**
 * embedded = เว็บนี้เป็น broker เอง อุปกรณ์ต่อเข้ามาที่เซิร์ฟเวอร์นี้โดยตรง
 * external = ไปเป็น client ของ broker ตัวอื่น (เช่น Mosquitto) ตาม MQTT_URL
 */
export const brokerMode =
  process.env.MQTT_MODE === "external" ? "external" : "embedded";

export const embeddedBrokerConfig = {
  port: num(process.env.MQTT_PORT, 1883),
  wsPort: num(process.env.MQTT_WS_PORT, 9001),
  /** ผูกกับทุก interface เพื่อให้อุปกรณ์ในวง LAN ต่อเข้ามาได้ */
  host: process.env.MQTT_BIND_HOST ?? "0.0.0.0",
};

export const mqttConfig = {
  url: process.env.MQTT_URL ?? "mqtt://localhost:1883",
  topics: (process.env.MQTT_TOPICS ?? "sensors/#")
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean),
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: `${process.env.MQTT_CLIENT_ID ?? "weather-dashboard"}-${Math.random()
    .toString(16)
    .slice(2, 10)}`,
};

export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? "Site 1",
  lat: num(process.env.NEXT_PUBLIC_SITE_LAT, 13.7563),
  lon: num(process.env.NEXT_PUBLIC_SITE_LON, 100.5018),
};

export const earthquakeConfig = {
  radiusKm: num(process.env.EARTHQUAKE_RADIUS_KM, 1500),
  minMagnitude: num(process.env.EARTHQUAKE_MIN_MAGNITUDE, 4.0),
};

export const alertThresholds = {
  temperature: {
    min: num(process.env.ALERT_TEMPERATURE_MIN, 5),
    max: num(process.env.ALERT_TEMPERATURE_MAX, 40),
  },
  humidity: {
    min: num(process.env.ALERT_HUMIDITY_MIN, 20),
    max: num(process.env.ALERT_HUMIDITY_MAX, 85),
  },
  vibration: {
    min: Number.NEGATIVE_INFINITY,
    max: num(process.env.ALERT_VIBRATION_MAX, 2.5),
  },
  light: {
    min: num(process.env.ALERT_LIGHT_MIN, 0),
    max: num(process.env.ALERT_LIGHT_MAX, 100000),
  },
};

export const noderedConfig = {
  url: process.env.NODERED_URL ?? "",
  enabled: bool(process.env.NODERED_ENABLED, true),
  flushMs: num(process.env.NODERED_FLUSH_MS, 10_000),
  batchSize: num(process.env.NODERED_BATCH_SIZE, 200),
  token: process.env.NODERED_TOKEN || undefined,
};

export const historySize = num(process.env.HISTORY_SIZE, 5000);

/**
 * รับข้อมูลเฉพาะอุปกรณ์ที่ระบุไว้ ถ้าเว้นว่างจะรับทุกอุปกรณ์
 * ใช้กันข้อมูลขยะหรือเครื่องแปลกหน้าที่ publish เข้ามาใน broker เดียวกัน
 */
export const deviceAllowlist = (process.env.DEVICE_ALLOWLIST ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export function isDeviceAllowed(deviceId: string): boolean {
  return deviceAllowlist.length === 0 || deviceAllowlist.includes(deviceId);
}
