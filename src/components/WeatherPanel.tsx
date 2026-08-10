"use client";

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n/LanguageProvider";
import type { WeatherPayload } from "@/lib/types";

/** จับกลุ่ม WMO weather code เป็นไอคอนตัวแทน */
function weatherIcon(code: number) {
  if (code === 0) return Sun;
  if (code <= 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code <= 48) return CloudFog;
  if (code <= 55) return CloudDrizzle;
  if (code <= 65) return CloudRain;
  if (code <= 77) return Snowflake;
  if (code <= 82) return CloudRain;
  return CloudLightning;
}

export function WeatherPanel() {
  const { d, formatNumber, formatTime, formatWeekday } = useI18n();
  const { data, error, loading } = usePolling<WeatherPayload>("/api/weather", 300_000);

  const NowIcon = data ? weatherIcon(data.now.weatherCode) : Sun;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{d.weather.title}</CardTitle>
        {data ? (
          <CardAction className="text-[11px] text-muted-foreground">
            {data.location.name} · {formatNumber(data.location.lat, 3)},{" "}
            {formatNumber(data.location.lon, 3)}
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent>
        {loading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-45 w-full" />
          </div>
        ) : error && !data ? (
          <p className="text-sm text-destructive">
            {d.common.error}: {error}
          </p>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <NowIcon className="size-12 text-primary" />
              <div>
                <p className="tabular text-4xl leading-none font-semibold">
                  {formatNumber(data.now.temperature, 1)}°C
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {d.weather.codes[data.now.weatherCode] ?? "—"}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                {(
                  [
                    [
                      d.weather.feelsLike,
                      `${formatNumber(data.now.apparentTemperature, 1)}°C`,
                    ],
                    [d.weather.humidity, `${formatNumber(data.now.humidity, 0)}%`],
                    [d.weather.wind, `${formatNumber(data.now.windSpeed, 1)} km/h`],
                    [
                      d.weather.precipitation,
                      `${formatNumber(data.now.precipitation, 1)} mm`,
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <h3 className="mt-5 text-xs font-medium text-muted-foreground">
              {d.weather.next24h}
            </h3>
            <div className="mt-2 h-45">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.hourly}
                  margin={{ top: 6, right: 8, bottom: 0, left: -18 }}
                >
                  <defs>
                    <linearGradient id="weather-temp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--temp)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--temp)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--grid)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="time"
                    tickFormatter={(time: string) => formatTime(time)}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--grid)"
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--grid)"
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                    labelFormatter={(time: string) => formatTime(time)}
                    formatter={(value: number) => [
                      `${formatNumber(value, 1)} °C`,
                      d.metrics.temperature,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="temperature"
                    stroke="var(--temp)"
                    strokeWidth={2}
                    fill="url(#weather-temp)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <h3 className="mt-4 text-xs font-medium text-muted-foreground">
              {d.weather.next7d}
            </h3>
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {data.daily.map((day) => {
                const DayIcon = weatherIcon(day.weatherCode);
                return (
                  <li
                    key={day.date}
                    className="rounded-lg border bg-muted/40 px-2 py-2 text-center"
                  >
                    <p className="text-[11px] text-muted-foreground">
                      {formatWeekday(day.date)}
                    </p>
                    <DayIcon className="mx-auto my-1 size-5 text-primary" />
                    <p className="tabular text-xs font-medium">
                      {formatNumber(day.tempMax, 0)}° / {formatNumber(day.tempMin, 0)}°
                    </p>
                    <p className="tabular text-[11px] text-humid">
                      {formatNumber(day.precipitationProbability, 0)}%
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
