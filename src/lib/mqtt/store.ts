import { EventEmitter } from "node:events";
import {
  alertThresholds,
  brokerMode,
  embeddedBrokerConfig,
  historySize,
  mqttConfig,
} from "@/lib/config";
import {
  METRICS,
  type BrokerStatus,
  type Metric,
  type MetricSnapshot,
  type Reading,
  type Snapshot,
} from "@/lib/types";

/**
 * Ring buffer + event bus ที่อยู่กลางระหว่าง MQTT subscriber กับผู้บริโภคทุกฝั่ง
 * (SSE stream, REST endpoints, Node-RED forwarder)
 */
class SensorStore {
  readonly bus = new EventEmitter();

  private readonly buffers: Record<Metric, Reading[]> = {
    temperature: [],
    humidity: [],
    vibration: [],
    light: [],
    uv: [],
    co2: [],
  };

  private readonly deviceIds = new Set<string>();

  private status: BrokerStatus = {
    state: "connecting",
    mode: brokerMode,
    url:
      brokerMode === "embedded"
        ? `mqtt://${embeddedBrokerConfig.host}:${embeddedBrokerConfig.port}`
        : mqttConfig.url,
    topics: mqttConfig.topics,
    since: Date.now(),
    lastMessageAt: null,
    messageCount: 0,
    lastError: null,
    clientCount: 0,
    clientIds: [],
    rejectedDevices: [],
    rejectedCount: 0,
  };

  private readonly rejected = new Set<string>();

  constructor() {
    // SSE ผู้ชมหลายคนพร้อมกัน + forwarder => ปิด warning ของ default limit 10
    this.bus.setMaxListeners(0);
  }

  push(reading: Reading): void {
    const buffer = this.buffers[reading.metric];
    buffer.push(reading);
    if (buffer.length > historySize) {
      buffer.splice(0, buffer.length - historySize);
    }

    this.deviceIds.add(reading.deviceId);
    this.status.lastMessageAt = reading.ts;
    this.status.messageCount += 1;

    this.bus.emit("reading", reading);
  }

  /** อัปเดตรายชื่ออุปกรณ์ที่กำลังต่อกับ broker ในตัว */
  setClients(clientIds: string[]): void {
    this.status.clientIds = clientIds;
    this.status.clientCount = clientIds.length;
    this.bus.emit("status", this.getStatus());
  }

  /** บันทึกว่ามีอุปกรณ์นอก allowlist ส่งค่าเข้ามา เพื่อให้เห็นบนแดชบอร์ด */
  rejectDevice(deviceId: string): void {
    this.status.rejectedCount += 1;
    if (this.rejected.has(deviceId)) return;

    this.rejected.add(deviceId);
    // เก็บชื่อไม่เกิน 20 ตัว กันเครื่องแปลกหน้ายิงชื่อสุ่มจนกินหน่วยความจำ
    if (this.rejected.size > 20) {
      this.rejected.delete([...this.rejected][0]);
    }
    this.status.rejectedDevices = [...this.rejected];
    this.bus.emit("status", this.getStatus());
  }

  setStatus(patch: Partial<BrokerStatus>): void {
    this.status = { ...this.status, ...patch };
    if (patch.state) this.status.since = Date.now();
    this.bus.emit("status", this.status);
  }

  getStatus(): BrokerStatus {
    return { ...this.status };
  }

  history(metric: Metric, limit = 300, sinceTs?: number): Reading[] {
    let rows = this.buffers[metric];
    if (sinceTs !== undefined) {
      rows = rows.filter((row) => row.ts >= sinceTs);
    }
    return rows.slice(-limit);
  }

  /** ข้อมูลทุก metric เรียงตามเวลา ใช้สำหรับ export / ส่งต่อ Node-RED */
  allReadings(sinceTs?: number): Reading[] {
    const rows = METRICS.flatMap((metric) => this.buffers[metric]);
    const filtered =
      sinceTs === undefined ? rows : rows.filter((row) => row.ts >= sinceTs);
    return filtered.sort((a, b) => a.ts - b.ts);
  }

  metricSnapshot(metric: Metric): MetricSnapshot {
    const rows = this.buffers[metric];
    if (rows.length === 0) {
      return { latest: null, avg: null, min: null, max: null, count: 0 };
    }

    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      sum += row.value;
      if (row.value < min) min = row.value;
      if (row.value > max) max = row.value;
    }

    return {
      latest: rows[rows.length - 1],
      avg: sum / rows.length,
      min,
      max,
      count: rows.length,
    };
  }

  snapshot(historyPoints = 300): Snapshot {
    const metrics = {} as Snapshot["metrics"];
    const history = {} as Snapshot["history"];

    for (const metric of METRICS) {
      metrics[metric] = this.metricSnapshot(metric);
      history[metric] = this.history(metric, historyPoints).map((row) => ({
        ts: row.ts,
        value: row.value,
        deviceId: row.deviceId,
      }));
    }

    return {
      broker: this.getStatus(),
      metrics,
      devices: [...this.deviceIds].sort(),
      history,
    };
  }
}

/**
 * Next.js dev server สร้าง module instance ใหม่ทุกครั้งที่ hot-reload
 * เก็บไว้บน globalThis เพื่อไม่ให้ buffer หายและไม่ให้ต่อ broker ซ้ำซ้อน
 */
const globalRef = globalThis as typeof globalThis & {
  __sensorStore?: SensorStore;
};

export const sensorStore: SensorStore = (globalRef.__sensorStore ??=
  new SensorStore());

export type AlertLevel = "ok" | "warn";

export function evaluateAlert(metric: Metric, value: number): AlertLevel {
  const threshold = alertThresholds[metric];
  return value > threshold.max || value < threshold.min ? "warn" : "ok";
}
