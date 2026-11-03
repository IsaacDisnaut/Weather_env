"use client";

import { useMemo } from "react";
import { Droplets, Sun, SunMedium, Thermometer, Waves, Wind } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/i18n/LanguageProvider";
import { computeStats } from "@/lib/stats";
import { METRIC_DIGITS, type HistoryPoint, type Metric } from "@/lib/types";

/** สีประจำ metric อ้างอิง token ชุดเดียวกับที่ประกาศไว้ใน globals.css */
export const METRIC_COLOR: Record<Metric, string> = {
  temperature: "var(--temp)",
  humidity: "var(--humid)",
  vibration: "var(--vib)",
  light: "var(--lux)",
  uv: "var(--uvi)",
  co2: "var(--co2)",
};

const METRIC_ICON: Record<Metric, typeof Thermometer> = {
  temperature: Thermometer,
  humidity: Droplets,
  vibration: Waves,
  light: Sun,
  uv: SunMedium,
  co2: Wind,
};

export function MetricCard({
  metric,
  series,
  threshold,
}: {
  metric: Metric;
  series: HistoryPoint[];
  threshold: { min: number; max: number };
}) {
  const { d, formatNumber } = useI18n();
  const color = METRIC_COLOR[metric];
  const digits = METRIC_DIGITS[metric];
  const stats = useMemo(() => computeStats(series), [series]);
  const value = stats.latest;
  const outOfRange = value !== null && (value > threshold.max || value < threshold.min);
  const spark = series.slice(-60);
  const Icon = METRIC_ICON[metric];

  return (
    <Card className="relative gap-3 overflow-hidden">
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: color }}
        aria-hidden
      />

      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="size-4" style={{ color }} />
          {d.metrics[metric]}
        </CardTitle>
        <CardAction>
          <Badge variant={outOfRange ? "destructive" : "secondary"}>
            {outOfRange ? d.stats.outOfRange : d.stats.normal}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="flex items-end gap-1.5">
          <span
            className="tabular text-4xl leading-none font-semibold"
            style={{ color }}
          >
            {value === null ? "—" : formatNumber(value, digits)}
          </span>
          <span className="pb-1 text-sm text-muted-foreground">{d.units[metric]}</span>
        </div>

        <div className="mt-3 h-12">
          {spark.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`spark-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={1.75}
                  fill={`url(#spark-${metric})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              {d.common.noData}
            </div>
          )}
        </div>

        <Separator className="my-3" />

        <dl className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              [d.stats.min, stats.min],
              [d.stats.average, stats.avg],
              [d.stats.max, stats.max],
            ] as const
          ).map(([label, statValue]) => (
            <div key={label}>
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="tabular text-sm font-medium">
                {statValue === null || !Number.isFinite(statValue)
                  ? "—"
                  : formatNumber(statValue, digits)}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {d.stats.threshold}: {Number.isFinite(threshold.min) ? threshold.min : "−∞"} –{" "}
          {Number.isFinite(threshold.max) ? threshold.max : "∞"} {d.units[metric]} ·{" "}
          <span className="tabular">{stats.count}</span> {d.stats.samples}
        </p>
      </CardContent>
    </Card>
  );
}
