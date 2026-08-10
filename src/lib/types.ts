/** อุปกรณ์ที่ลงทะเบียนไว้ — ใช้ร่วมกันทั้งฝั่ง server และ client */
export type DeviceRecord = {
  /** ชื่อที่ใช้ใน topic */
  id: string;
  label: string;
  topic: string;
  createdAt: number;
};

export type DevicesResponse = {
  devices: DeviceRecord[];
  suggestion: string;
};

export const METRICS = ["temperature", "humidity", "vibration", "light"] as const;

export type Metric = (typeof METRICS)[number];

/** จำนวนทศนิยมที่เหมาะกับแต่ละค่า — ใช้ร่วมกันทุกที่ที่แสดงตัวเลข */
export const METRIC_DIGITS: Record<Metric, number> = {
  temperature: 1,
  humidity: 1,
  vibration: 2,
  light: 0,
};

export type Reading = {
  /** epoch ms */
  ts: number;
  metric: Metric;
  value: number;
  deviceId: string;
  topic: string;
};

export type MetricSnapshot = {
  latest: Reading | null;
  /** ค่าเฉลี่ย / ต่ำสุด / สูงสุด ของข้อมูลที่ยังอยู่ใน buffer */
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
};

export type ConnectionState = "connecting" | "online" | "offline" | "error";

export type BrokerMode = "embedded" | "external";

export type BrokerStatus = {
  state: ConnectionState;
  /** embedded = เซิร์ฟเวอร์นี้เป็น broker เอง */
  mode: BrokerMode;
  url: string;
  topics: string[];
  since: number;
  lastMessageAt: number | null;
  messageCount: number;
  lastError: string | null;
  /** จำนวนอุปกรณ์ที่กำลังเชื่อมต่ออยู่ (เฉพาะโหมด embedded) */
  clientCount: number;
  clientIds: string[];
  /** รายชื่ออุปกรณ์ที่ถูก DEVICE_ALLOWLIST กรองทิ้ง (ไว้ debug ตอนเซนเซอร์ใหม่ไม่ขึ้น) */
  rejectedDevices: string[];
  rejectedCount: number;
};

export type HistoryPoint = { ts: number; value: number; deviceId: string };

export type Snapshot = {
  broker: BrokerStatus;
  metrics: Record<Metric, MetricSnapshot>;
  devices: string[];
  history: Record<Metric, HistoryPoint[]>;
};

export type StreamEvent =
  | { type: "snapshot"; payload: Snapshot }
  | { type: "reading"; payload: Reading }
  | { type: "status"; payload: BrokerStatus };

export type WeatherNow = {
  temperature: number;
  humidity: number;
  apparentTemperature: number;
  precipitation: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
  time: string;
};

export type WeatherHourly = {
  time: string;
  temperature: number;
  humidity: number;
  precipitationProbability: number;
};

export type WeatherDaily = {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number;
};

export type WeatherPayload = {
  location: { name: string; lat: number; lon: number; timezone: string };
  now: WeatherNow;
  hourly: WeatherHourly[];
  daily: WeatherDaily[];
  fetchedAt: number;
};

export type Quake = {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  depthKm: number;
  distanceKm: number;
  lat: number;
  lon: number;
  url: string;
  tsunami: boolean;
  /** เข้าเกณฑ์แจ้งเตือน (อยู่ในรัศมี และแรงถึงเกณฑ์) */
  alert: boolean;
};

export type QuakePayload = {
  quakes: Quake[];
  radiusKm: number;
  minMagnitude: number;
  fetchedAt: number;
};
