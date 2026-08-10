import "server-only";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { deviceAllowlist } from "@/lib/config";

import type { DeviceRecord } from "@/lib/types";

export type { DeviceRecord };

const STORE_PATH = join(process.cwd(), "data", "devices.json");

/** ชื่ออุปกรณ์ต้องปลอดภัยกับ MQTT topic — ห้ามมี / + # หรือช่องว่าง */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

type Cache = { devices: DeviceRecord[]; mtimeMs: number; checkedAt: number };

const globalRef = globalThis as typeof globalThis & {
  __deviceCache?: Cache;
};

/** เว้นช่วงก่อน stat ไฟล์ซ้ำ เพราะ isDeviceRegistered ถูกเรียกทุกข้อความ MQTT */
const RECHECK_MS = 500;

export function topicFor(id: string): string {
  return `sensors/${id}/data`;
}

function seed(): DeviceRecord[] {
  // ครั้งแรกใช้รายชื่อจาก DEVICE_ALLOWLIST เป็นตัวตั้งต้น
  return deviceAllowlist.map((id) => ({
    id,
    label: id,
    topic: topicFor(id),
    createdAt: Date.now(),
  }));
}

/**
 * ไฟล์เป็นแหล่งข้อมูลจริงเสมอ ไม่ยึด cache ในหน่วยความจำ
 * เพราะ Next.js อาจโหลดโมดูลนี้เป็นคนละ instance ระหว่าง route handler
 * กับตัวรับ MQTT ทำให้ตัวหนึ่งเพิ่มอุปกรณ์แล้วอีกตัวมองไม่เห็น
 */
function load(): DeviceRecord[] {
  const cache = globalRef.__deviceCache;
  const now = Date.now();

  if (cache && now - cache.checkedAt < RECHECK_MS) return cache.devices;

  let mtimeMs = 0;
  try {
    mtimeMs = statSync(STORE_PATH).mtimeMs;
  } catch {
    // ยังไม่มีไฟล์ — สร้างจากรายชื่อใน env
    const devices = seed();
    save(devices);
    return devices;
  }

  if (cache && cache.mtimeMs === mtimeMs) {
    cache.checkedAt = now;
    return cache.devices;
  }

  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as DeviceRecord[];
    const devices = Array.isArray(parsed) ? parsed : seed();
    globalRef.__deviceCache = { devices, mtimeMs, checkedAt: now };
    return devices;
  } catch {
    const devices = cache?.devices ?? seed();
    globalRef.__deviceCache = { devices, mtimeMs, checkedAt: now };
    return devices;
  }
}

function save(devices: DeviceRecord[]): void {
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, `${JSON.stringify(devices, null, 2)}\n`, "utf8");
    // อัปเดต cache ทันทีเพื่อไม่ให้อ่านค่าเก่าในช่วง RECHECK_MS
    globalRef.__deviceCache = {
      devices,
      mtimeMs: statSync(STORE_PATH).mtimeMs,
      checkedAt: Date.now(),
    };
  } catch (error) {
    console.error("[devices] บันทึกไฟล์ไม่สำเร็จ:", error);
  }
}

export function listDevices(): DeviceRecord[] {
  return [...load()].sort((a, b) => a.id.localeCompare(b.id));
}

export type AddResult =
  | { ok: true; device: DeviceRecord }
  | { ok: false; error: "invalid" | "duplicate" };

export function addDevice(rawId: string, rawLabel?: string): AddResult {
  const id = rawId.trim();
  if (!ID_PATTERN.test(id)) return { ok: false, error: "invalid" };

  const devices = [...load()];
  if (devices.some((device) => device.id.toLowerCase() === id.toLowerCase())) {
    return { ok: false, error: "duplicate" };
  }

  const device: DeviceRecord = {
    id,
    label: rawLabel?.trim() || id,
    topic: topicFor(id),
    createdAt: Date.now(),
  };

  devices.push(device);
  save(devices);
  return { ok: true, device };
}

export function removeDevice(id: string): boolean {
  const devices = load();
  if (!devices.some((device) => device.id === id)) return false;

  save(devices.filter((device) => device.id !== id));
  return true;
}

/**
 * รับข้อมูลเฉพาะอุปกรณ์ที่ลงทะเบียนไว้
 * ถ้ายังไม่มีอุปกรณ์เลยจะรับทุกตัว เพื่อไม่ให้ระบบเงียบสนิทตอนเพิ่งติดตั้ง
 */
export function isDeviceRegistered(id: string): boolean {
  const devices = load();
  return devices.length === 0 || devices.some((device) => device.id === id);
}

/** ชื่อถัดไปในซีรีส์ dev-A, dev-B, … สำหรับเติมให้ในช่องกรอกอัตโนมัติ */
export function suggestNextId(): string {
  const devices = load();
  const used = new Set(devices.map((device) => device.id));

  for (let index = 0; index < 26; index += 1) {
    const candidate = `dev-${String.fromCharCode(65 + index)}`;
    if (!used.has(candidate)) return candidate;
  }

  return `dev-${devices.length + 1}`;
}
