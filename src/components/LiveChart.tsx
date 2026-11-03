"use client";

import { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { METRIC_COLOR } from "@/components/MetricCard";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n/LanguageProvider";
import type { Series } from "@/hooks/useSensorStream";
import { METRIC_DIGITS, METRICS, type Metric } from "@/lib/types";

/**
 * แต่ละค่ามีสเกลต่างกันมาก (ความสว่างเป็นหลักหมื่น lux ส่วนแรงสั่นสะเทือนไม่ถึง 10)
 * จึงต้องแยกแกน Y ไม่งั้นเส้นที่ค่าน้อยจะแบนติดพื้น
 */
const METRIC_AXIS: Record<Metric, string> = {
  temperature: "left",
  humidity: "left",
  vibration: "right",
  light: "lux",
  uv: "uvi",
  co2: "co2",
};

const WINDOWS = [
  { key: "m5", ms: 5 * 60_000 },
  { key: "m15", ms: 15 * 60_000 },
  { key: "h1", ms: 60 * 60_000 },
  { key: "h6", ms: 6 * 60 * 60_000 },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

type Row = { ts: number } & Partial<Record<Metric, number>>;

/**
 * รวม series ของแต่ละ metric เข้าเป็นแถวเดียวกันตาม timestamp เพื่อวาดในกราฟเดียว
 * ถ้าเลือกดูทุกอุปกรณ์ ค่าที่ timestamp เดียวกันจะถูกเฉลี่ยแทนการทับกัน
 */
function mergeSeries(series: Series, visible: Metric[], sinceTs: number): Row[] {
  const byTimestamp = new Map<number, Row>();
  const counters = new Map<string, { sum: number; count: number }>();

  for (const metric of visible) {
    for (const point of series[metric]) {
      if (point.ts < sinceTs) continue;

      const key = `${point.ts}:${metric}`;
      const counter = counters.get(key) ?? { sum: 0, count: 0 };
      counter.sum += point.value;
      counter.count += 1;
      counters.set(key, counter);

      const row = byTimestamp.get(point.ts) ?? { ts: point.ts };
      row[metric] = counter.sum / counter.count;
      byTimestamp.set(point.ts, row);
    }
  }

  return [...byTimestamp.values()].sort((a, b) => a.ts - b.ts);
}

export function LiveChart({
  series,
  paused,
  onTogglePause,
}: {
  series: Series;
  paused: boolean;
  onTogglePause: () => void;
}) {
  const { d, formatTime, formatNumber } = useI18n();
  const [windowKey, setWindowKey] = useState<WindowKey>("m15");
  const [visible, setVisible] = useState<Metric[]>([...METRICS]);

  const windowMs = WINDOWS.find((item) => item.key === windowKey)!.ms;
  const rows = useMemo(
    () => mergeSeries(series, visible, Date.now() - windowMs),
    [series, visible, windowMs],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{d.chart.title}</CardTitle>

        <CardAction className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            value={visible}
            onValueChange={(value) => setVisible(value as Metric[])}
            size="sm"
            variant="outline"
            aria-label={d.chart.title}
          >
            {METRICS.map((metric) => (
              <ToggleGroupItem key={metric} value={metric}>
                <span
                  className="size-2 rounded-full"
                  style={{ background: METRIC_COLOR[metric] }}
                  aria-hidden
                />
                {d.metrics[metric]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <Select
            value={windowKey}
            onValueChange={(value) => setWindowKey(value as WindowKey)}
          >
            <SelectTrigger size="sm" aria-label={d.chart.window}>
              <SelectValue>{d.chart.windows[windowKey]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {d.chart.windows[item.key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={onTogglePause}>
            {paused ? <Play /> : <Pause />}
            {paused ? d.chart.resume : d.chart.pause}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="h-85">
          {rows.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              {d.chart.waiting}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid
                  stroke="var(--grid)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(ts: number) => formatTime(ts)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--grid)"
                  minTickGap={40}
                />
                {/* ซ้าย: อุณหภูมิ+ความชื้น / UV / CO2 — ขวา: แรงสั่นสะเทือน / ความสว่าง */}
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--grid)"
                  width={48}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--grid)"
                  width={44}
                />
                <YAxis
                  yAxisId="uvi"
                  tick={{ fontSize: 11, fill: "var(--uvi)" }}
                  stroke="var(--grid)"
                  width={34}
                />
                <YAxis
                  yAxisId="co2"
                  tick={{ fontSize: 11, fill: "var(--co2)" }}
                  stroke="var(--grid)"
                  width={46}
                />
                <YAxis
                  yAxisId="lux"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "var(--lux)" }}
                  stroke="var(--grid)"
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                  labelFormatter={(ts: number) => `${d.chart.time}: ${formatTime(ts)}`}
                  formatter={(value: number, name: string) => {
                    const metric =
                      METRICS.find((item) => d.metrics[item] === name) ?? "temperature";
                    return [
                      `${formatNumber(value, METRIC_DIGITS[metric])} ${d.units[metric]}`,
                      name,
                    ];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {visible.map((metric) => (
                  <Line
                    key={metric}
                    yAxisId={METRIC_AXIS[metric]}
                    type="monotone"
                    dataKey={metric}
                    name={d.metrics[metric]}
                    stroke={METRIC_COLOR[metric]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
