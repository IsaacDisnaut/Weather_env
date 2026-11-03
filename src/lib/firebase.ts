import "server-only";
import { firebaseConfig } from "@/lib/config";
import { sensorStore } from "@/lib/mqtt/store";
import { METRIC_DIGITS, type Metric, type Reading } from "@/lib/types";

/**
 * ส่งค่าล่าสุดของแต่ละอุปกรณ์ขึ้น Firebase Realtime Database
 * โครงสร้าง: {FIREBASE_BASE_PATH}/{A|B|C...} = { temp, rh, lux, uv, co2, vib, ts }
 * ใช้ REST API ตรง ๆ ไม่ต้องลง firebase SDK
 */

/** ชื่อฟิลด์ตามข้อมูลที่มีอยู่แล้วใน tiewwat/live/ubosot */
const FIELD: Record<Metric, string> = {
  temperature: "temp",
  humidity: "rh",
  light: "lux",
  uv: "uv",
  co2: "co2",
  vibration: "vib",
};

type DeviceLive = Record<string, number | boolean>;

export type FirebaseStatus = {
  enabled: boolean;
  url: string;
  path: string;
  authMode: string;
  uid: string | null;
  nextAuthRetryAt: number | null;
  /** อุปกรณ์ที่มีค่าใหม่รอส่ง */
  pending: string[];
  sentCount: number;
  failedCount: number;
  lastSentAt: number | null;
  lastError: string | null;
};

type ForwarderState = {
  live: Map<string, DeviceLive>;
  dirty: Set<string>;
  timer: NodeJS.Timeout | null;
  listener: ((reading: Reading) => void) | null;
  /** เวอร์ชันของโมดูลที่ลงทะเบียน timer/listener ไว้ — เปลี่ยนเมื่อ hot-reload */
  owner: symbol | null;
  sentCount: number;
  failedCount: number;
  lastSentAt: number | null;
  lastError: string | null;
  started: boolean;
  flushing: boolean;
  token: { idToken: string; refreshToken: string; expiresAt: number } | null;
  /** uid ของบัญชีที่ล็อกอิน (โหมด password) — ต้องมี devices/{uid} ใน DB */
  uid: string | null;
  /** ล็อกอินไม่ผ่านติดกันกี่ครั้ง — ใช้คำนวณเวลารอก่อนลองใหม่ */
  authFailures: number;
  /** ห้ามลองล็อกอินก่อนเวลานี้ กัน Firebase บล็อก (TOO_MANY_ATTEMPTS_TRY_LATER) */
  authRetryAt: number;
};

const globalRef = globalThis as typeof globalThis & {
  __firebaseForwarder?: ForwarderState;
};

const state: ForwarderState = (globalRef.__firebaseForwarder ??= {
  live: new Map(),
  dirty: new Set(),
  timer: null,
  listener: null,
  owner: null,
  sentCount: 0,
  failedCount: 0,
  lastSentAt: null,
  lastError: null,
  started: false,
  flushing: false,
  token: null,
  uid: null,
  authFailures: 0,
  authRetryAt: 0,
});

// state ที่ค้างจาก hot-reload รอบก่อนอาจยังไม่มีฟิลด์ใหม่
state.uid ??= null;
state.authFailures ??= 0;
state.authRetryAt ??= 0;

const MODULE_ID = Symbol("firebase-forwarder");

const isEnabled = () => firebaseConfig.enabled && Boolean(firebaseConfig.databaseURL);

/** dev-A -> A และตัดอักขระที่ Firebase ห้ามใช้ในชื่อ key ออก */
export function deviceKey(deviceId: string): string {
  return deviceId.replace(/^dev[-_]/i, "").replace(/[.$#[\]/]/g, "_") || "_";
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * ขอ / ต่ออายุ ID token
 * password = ล็อกอินด้วย email/password (uid คงที่ ผูกกับ devices/{uid} ใน rules ได้)
 * anonymous = uid ใหม่ทุกครั้งที่ restart — ใช้ได้เฉพาะ rules ที่เช็กแค่ auth != null
 */
async function idToken(): Promise<string> {
  const now = Date.now();
  if (state.token && state.token.expiresAt - 60_000 > now) return state.token.idToken;

  const key = encodeURIComponent(firebaseConfig.apiKey);
  let data: { idToken?: string; id_token?: string; refreshToken?: string; refresh_token?: string; expiresIn?: string; expires_in?: string };

  if (state.token) {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: state.token.refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // refresh token ใช้ไม่ได้แล้ว ล้างทิ้งแล้วขอใหม่รอบหน้า
      state.token = null;
      throw new Error(`Firebase token refresh ${response.status}`);
    }
    data = await response.json();
  } else {
    const password = firebaseConfig.authMode === "password";
    const endpoint = password ? "accounts:signInWithPassword" : "accounts:signUp";
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        password
          ? { email: firebaseConfig.email, password: firebaseConfig.password, returnSecureToken: true }
          : { returnSecureToken: true },
      ),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = (await response.text()).match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? response.statusText;
      throw new Error(`Firebase ${password ? "password" : "anonymous"} sign-in ${response.status}: ${body}`);
    }
    data = await response.json();
    if (password) state.uid = (data as { localId?: string }).localId ?? null;
  }

  const idToken = data.idToken ?? data.id_token ?? "";
  state.token = {
    idToken,
    refreshToken: data.refreshToken ?? data.refresh_token ?? "",
    expiresAt: now + Number(data.expiresIn ?? data.expires_in ?? 3600) * 1000,
  };
  return idToken;
}

async function authQuery(): Promise<string> {
  if (firebaseConfig.authMode === "secret" && firebaseConfig.secret) {
    return `?auth=${encodeURIComponent(firebaseConfig.secret)}`;
  }
  if (firebaseConfig.authMode === "password" || firebaseConfig.authMode === "anonymous") {
    return `?auth=${encodeURIComponent(await idToken())}`;
  }
  return "";
}

/**
 * เขียนทับค่าล่าสุดของอุปกรณ์หนึ่งตัวทั้งก้อน
 * ส่งแยกรายตัวเพราะ rules ตรวจ .write/.validate ที่ระดับ {building}/{zone}
 * ถ้ารวมเป็น PATCH เดียว ค่าผิดเกณฑ์ของตัวเดียวจะทำให้ทุกตัวถูกปฏิเสธ
 */
export async function pushToFirebase(key: string, live: DeviceLive, auth: string): Promise<void> {
  if (!firebaseConfig.databaseURL) throw new Error("FIREBASE_DATABASE_URL is not configured");

  const base = firebaseConfig.databaseURL.replace(/\/+$/, "");
  const path = firebaseConfig.basePath.replace(/^\/+|\/+$/g, "");
  const response = await fetch(`${base}/${path}/${encodeURIComponent(key)}.json${auth}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(live),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    if (response.status === 401 && !state.uid) state.token = null;
    const reason = (await response.text()).match(/"error"\s*:\s*"([^"]+)"/)?.[1] ?? response.statusText;
    const hint =
      response.status === 401 && state.uid
        ? ` (ตั้ง devices/${state.uid} = "*" ใน Firebase Console)`
        : "";
    throw new Error(`${key}: Firebase ${response.status} ${reason}${hint}`);
  }
}

async function flush(): Promise<void> {
  if (state.flushing || state.dirty.size === 0 || Date.now() < state.authRetryAt) return;
  state.flushing = true;

  const keys = [...state.dirty];
  state.dirty.clear();

  try {
    // ล็อกอินครั้งเดียวต่อรอบ แล้วใช้ token เดียวกันส่งทุกอุปกรณ์
    let auth: string;
    try {
      auth = await authQuery();
      state.authFailures = 0;
    } catch (error) {
      // รอ 15 วิ, 30 วิ, 1 นาที ... สูงสุด 5 นาที ก่อนลองล็อกอินใหม่
      state.authFailures += 1;
      state.authRetryAt = Date.now() + Math.min(300_000, 15_000 * 2 ** (state.authFailures - 1));
      throw error;
    }

    const results = await Promise.allSettled(
      keys.map((key) => {
        const live = state.live.get(key)!;
        // rules ไม่รับ ts ที่ล้ำอนาคตเกิน 60 วินาที — กันนาฬิกาบอร์ดเพี้ยน
        const ts = Math.min(Number(live.ts) || Date.now(), Date.now());
        return pushToFirebase(key, { ...live, ts, demo: false }, auth);
      }),
    );

    let failure: string | null = null;
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        state.sentCount += 1;
        state.lastSentAt = Date.now();
      } else {
        state.failedCount += 1;
        failure = result.reason instanceof Error ? result.reason.message : String(result.reason);
        // ส่งไม่ผ่านก็แค่ mark ไว้ส่งรอบหน้า ค่าเป็น "ล่าสุด" อยู่แล้ว ไม่ต้องเก็บคิว
        state.dirty.add(keys[i]);
      }
    });
    state.lastError = failure;
  } catch (error) {
    // ล็อกอินไม่ผ่าน — ทุกตัวรอส่งรอบหน้า
    state.failedCount += 1;
    state.lastError = error instanceof Error ? error.message : String(error);
    for (const key of keys) state.dirty.add(key);
  } finally {
    state.flushing = false;
  }
}

/** ดักฟังค่าจาก MQTT เก็บค่าล่าสุดต่ออุปกรณ์ แล้วส่งขึ้น Firebase ทุก FIREBASE_FLUSH_MS */
export function startFirebaseForwarder(): void {
  if (state.owner === MODULE_ID) return;

  // hot-reload: ถอด timer/listener ของโมดูลเวอร์ชันเก่าออก ไม่งั้นโค้ดเก่ายังทำงานต่อ
  if (state.timer) clearInterval(state.timer);
  if (state.listener) sensorStore.bus.off("reading", state.listener);
  state.owner = MODULE_ID;
  state.started = true;

  state.listener = (reading: Reading) => {
    if (!isEnabled()) return;
    const key = deviceKey(reading.deviceId);
    const live = state.live.get(key) ?? {};
    live[FIELD[reading.metric]] = round(reading.value, METRIC_DIGITS[reading.metric]);
    live.ts = Math.max(Number(live.ts) || 0, reading.ts);
    state.live.set(key, live);
    state.dirty.add(key);
  };
  sensorStore.bus.on("reading", state.listener);

  state.timer = setInterval(() => {
    if (!isEnabled()) return;
    void flush();
  }, firebaseConfig.flushMs);

  state.timer.unref?.();
}

export function firebaseStatus(): FirebaseStatus {
  return {
    enabled: isEnabled(),
    url: firebaseConfig.databaseURL,
    path: firebaseConfig.basePath,
    authMode: firebaseConfig.authMode,
    uid: state.uid,
    nextAuthRetryAt: state.authRetryAt > Date.now() ? state.authRetryAt : null,
    pending: [...state.dirty],
    sentCount: state.sentCount,
    failedCount: state.failedCount,
    lastSentAt: state.lastSentAt,
    lastError: state.lastError,
  };
}
