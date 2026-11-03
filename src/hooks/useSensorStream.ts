"use client";

import { useEffect, useRef, useState } from "react";
import {
  METRICS,
  type BrokerStatus,
  type HistoryPoint,
  type Metric,
  type Reading,
  type Snapshot,
} from "@/lib/types";

export type Series = Record<Metric, HistoryPoint[]>;

const CLIENT_HISTORY_LIMIT = 3000;

function emptySeries(): Series {
  return { temperature: [], humidity: [], vibration: [], light: [], uv: [], co2: [] };
}

export type SensorStreamState = {
  connected: boolean;
  broker: BrokerStatus | null;
  series: Series;
  devices: string[];
};

/**
 * ต่อ /api/stream ด้วย EventSource แล้วสะสมค่าไว้ในหน่วยความจำฝั่ง client
 * เพื่อวาดกราฟแบบเรียลไทม์ (EventSource reconnect ให้เองเมื่อหลุด)
 */
export function useSensorStream(paused = false): SensorStreamState {
  const [connected, setConnected] = useState(false);
  const [broker, setBroker] = useState<BrokerStatus | null>(null);
  const [series, setSeries] = useState<Series>(emptySeries);
  const [devices, setDevices] = useState<string[]>([]);

  // ข้อมูลเข้าเร็วกว่าที่ React จะ render ไหว จึงพักไว้ใน ref แล้ว flush ตามรอบ
  const pending = useRef<Reading[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const source = new EventSource("/api/stream");

    source.addEventListener("open", () => setConnected(true));

    source.addEventListener("snapshot", (event) => {
      const snapshot = JSON.parse((event as MessageEvent<string>).data) as Snapshot;
      setConnected(true);
      setBroker(snapshot.broker);
      setDevices(snapshot.devices);
      setSeries(snapshot.history);
    });

    source.addEventListener("status", (event) => {
      setBroker(JSON.parse((event as MessageEvent<string>).data) as BrokerStatus);
    });

    source.addEventListener("reading", (event) => {
      pending.current.push(JSON.parse((event as MessageEvent<string>).data) as Reading);
    });

    source.addEventListener("error", () => setConnected(false));

    const flush = setInterval(() => {
      const batch = pending.current;
      if (batch.length === 0) return;
      pending.current = [];
      if (pausedRef.current) return;

      setSeries((previous) => {
        const next: Series = { ...previous };
        for (const metric of METRICS) {
          const additions = batch.filter((reading) => reading.metric === metric);
          if (additions.length === 0) continue;
          const merged = [
            ...previous[metric],
            ...additions.map(({ ts, value, deviceId }) => ({ ts, value, deviceId })),
          ];
          next[metric] =
            merged.length > CLIENT_HISTORY_LIMIT
              ? merged.slice(merged.length - CLIENT_HISTORY_LIMIT)
              : merged;
        }
        return next;
      });

      setDevices((previous) => {
        const merged = new Set(previous);
        for (const reading of batch) merged.add(reading.deviceId);
        return merged.size === previous.length ? previous : [...merged].sort();
      });
    }, 500);

    return () => {
      clearInterval(flush);
      source.close();
    };
  }, []);

  return { connected, broker, series, devices };
}
