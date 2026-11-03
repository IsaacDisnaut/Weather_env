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

export const METRICS = ["temperature", "humidity", "vibration", "light", "uv", "co2"] as const;

export type Metric = (typeof METRICS)[number];

/** จำนวนทศนิยมที่เหมาะกับแต่ละค่า — ใช้ร่วมกันทุกที่ที่แสดงตัวเลข */
export const METRIC_DIGITS: Record<Metric, number> = {
  temperature: 1,
  humidity: 1,
  vibration: 2,
  light: 0,
  uv: 1,
  co2: 0,
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

// ---------- การใช้งานแอป AR (android-ar) ----------

/** ข้อมูลที่ทุก event จากแอปมีเหมือนกัน */
type UsageEventBase = {
  /** id ที่แอปสร้างเอง ใช้กันบันทึกซ้ำเมื่อส่ง batch เดิมอีกรอบหลังเน็ตหลุด */
  id: string;
  ts: number;
  /** id สุ่มประจำเครื่องที่ติดตั้ง — ไม่ผูกกับตัวบุคคล ใช้แค่นับว่ากี่เครื่อง */
  installId: string;
  sessionId: string;
  lang: string;
  appVersion: string;
};

/** ส่องเห็น marker หนึ่งใบหนึ่งครั้ง (นับใหม่เมื่อเล็งกลับมาที่จุดเดิมอีกรอบ) */
export type UsageScanEvent = UsageEventBase & {
  kind: "scan";
  deviceId: string;
  arucoId: number | null;
  label: string;
  location: string | null;
  /** ค้างอยู่ที่จุดนี้นานเท่าไรก่อนเลิกส่อง */
  dwellMs: number;
};

/** เปิดแอปหนึ่งครั้ง — นับเฉพาะช่วงที่แอปอยู่หน้าจอจริง */
export type UsageSessionEvent = UsageEventBase & {
  kind: "session";
  durationMs: number;
  scanCount: number;
};

export type UsageEvent = UsageScanEvent | UsageSessionEvent;

export type FeedbackEntry = {
  id: string;
  ts: number;
  installId: string;
  sessionId: string | null;
  /** 1-5 ดาว — null เมื่อผู้ใช้พิมพ์ข้อความอย่างเดียว */
  rating: number | null;
  tags: string[];
  message: string;
  /** จุดที่กำลังส่องอยู่ตอนกดส่ง ช่วยให้รู้ว่าปัญหาเกิดที่จุดไหน */
  deviceId: string | null;
  deviceLabel: string | null;
  /** ช่องทางติดต่อกลับ ใส่หรือไม่ใส่ก็ได้ */
  contact: string | null;
  lang: string;
  appVersion: string;
  sessionMs: number;
  scanCount: number;
};

/** สรุปรายจุด — แถวหนึ่งคือ marker หนึ่งใบ */
export type UsagePoint = {
  deviceId: string;
  label: string;
  location: string | null;
  arucoId: number | null;
  scans: number;
  /** จำนวนเครื่องที่เคยสแกนจุดนี้ */
  uniqueVisitors: number;
  totalDwellMs: number;
  avgDwellMs: number;
  lastScanAt: number;
};

export type UsageSummary = {
  generatedAt: number;
  sinceTs: number | null;
  totals: {
    scans: number;
    sessions: number;
    usageMs: number;
    installs: number;
    avgSessionMs: number;
    feedback: number;
    avgRating: number | null;
  };
  points: UsagePoint[];
  daily: { date: string; scans: number; sessions: number; usageMs: number }[];
  tagCounts: { tag: string; count: number }[];
  feedback: FeedbackEntry[];
};

// ---------------------------------------------------------------------------
// เกมตอบคำถามที่เล่นผ่าน marker ของแอป AR
// ---------------------------------------------------------------------------

export type QuizLang = "th" | "en";

/** หมวดของคำถาม ใช้จัดกลุ่มตอนดูว่าคนพลาดเรื่องไหนบ่อย */
export type QuizTopic =
  | "order-title"
  | "title-order"
  | "title-month"
  | "month-title"
  | "title-scene"
  | "scene-title"
  | "temple"
  /**
   * ข้อความรู้สึกท้ายเกม ไม่มีคำตอบถูกผิดและไม่นับเป็นคะแนน
   * เก็บแยกเป็นของตัวเองเพราะเป็นคนละเรื่องกับความรู้ — วัดว่าคนดูอยากให้อนุรักษ์แค่ไหน
   */
  | "conservation";

export type QuizQuestion = {
  /** id คงที่ของคำถาม เช่น "title-month:dev-G" ใช้รวมสถิติข้ามเกม */
  id: string;
  topic: QuizTopic;
  prompt: string;
  /** สี่ตัวเลือก สลับลำดับแล้วตาม seed — ข้อความรู้สึกมีหกตัวเลือกและไม่สลับ */
  choices: string[];
  /** -1 = ข้อนี้ไม่มีคำตอบถูก (ข้อความรู้สึก) ตัวเลือกที่กดคือค่าที่ต้องการเก็บ */
  answerIndex: number;
};

/** ชุดคำถามที่ส่งให้แอป — ส่ง seed ไปด้วยเพื่อให้ส่งกลับมาตอนตรวจคะแนน */
export type QuizSet = {
  seed: number;
  lang: QuizLang;
  /** จำนวนข้อความรู้ ไม่รวมข้อความรู้สึกที่ต่อท้ายเสมอ */
  count: number;
  questions: QuizQuestion[];
};

/** คะแนนความอยากอนุรักษ์ 0 = ไม่เลย ถึง 5 = มากที่สุด */
export const CONSERVATION_SCALE = [0, 1, 2, 3, 4, 5] as const;

/** ผลการเล่นหนึ่งรอบ ตามที่เซิร์ฟเวอร์ตรวจแล้ว */
export type QuizResult = {
  id: string;
  ts: number;
  installId: string;
  sessionId: string | null;
  lang: QuizLang;
  appVersion: string;
  seed: number;
  /** จำนวนข้อความรู้ ไม่รวมข้อความรู้สึก */
  total: number;
  correct: number;
  durationMs: number;
  answers: { questionId: string; topic: QuizTopic; chosenIndex: number; correct: boolean }[];
  /** 0–5 ตามที่ผู้เล่นกด หรือ null ถ้าไม่ได้ตอบ */
  conservation: number | null;
};

/** สถิติรายคำถาม ไว้ดูว่าข้อไหนคนตอบผิดบ่อย */
export type QuizQuestionStat = {
  questionId: string;
  topic: QuizTopic;
  asked: number;
  correct: number;
  accuracy: number;
};

export type QuizSummary = {
  generatedAt: number;
  sinceTs: number | null;
  totals: {
    /** จำนวนครั้งที่เล่นจบ */
    plays: number;
    players: number;
    questionsAnswered: number;
    correct: number;
    accuracy: number;
    avgScore: number;
    avgDurationMs: number;
    perfect: number;
    /** ค่าเฉลี่ยความอยากอนุรักษ์ เฉพาะคนที่ตอบข้อนี้ */
    conservationAvg: number | null;
    conservationResponses: number;
  };
  /** จำนวนครั้งที่ได้คะแนนเท่านั้น ๆ — index คือคะแนนที่ได้ */
  scoreSpread: { score: number; plays: number }[];
  /** จำนวนคนที่เลือกแต่ละระดับ 0–5 */
  conservationSpread: { score: number; responses: number }[];
  hardest: QuizQuestionStat[];
  daily: { date: string; plays: number; correct: number; asked: number }[];
  recent: QuizResult[];
};
