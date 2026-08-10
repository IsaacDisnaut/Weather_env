import type { HistoryPoint } from "@/lib/types";

export type Stats = {
  latest: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
};

export const EMPTY_STATS: Stats = {
  latest: null,
  avg: null,
  min: null,
  max: null,
  count: 0,
};

/** สรุปค่าจากชุดข้อมูลที่กำลังแสดงอยู่ (หลังกรองอุปกรณ์แล้ว) */
export function computeStats(points: HistoryPoint[]): Stats {
  if (points.length === 0) return EMPTY_STATS;

  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    sum += point.value;
    if (point.value < min) min = point.value;
    if (point.value > max) max = point.value;
  }

  return {
    latest: points[points.length - 1].value,
    avg: sum / points.length,
    min,
    max,
    count: points.length,
  };
}

export const ALL_DEVICES = "__all__";

export function filterByDevice(
  points: HistoryPoint[],
  deviceId: string,
): HistoryPoint[] {
  return deviceId === ALL_DEVICES
    ? points
    : points.filter((point) => point.deviceId === deviceId);
}
