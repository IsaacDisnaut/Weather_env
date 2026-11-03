"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertBanner, type Thresholds } from "@/components/AlertBanner";
import { BrokerBadge } from "@/components/BrokerBadge";
import { DeviceManager } from "@/components/DeviceManager";
import { Header } from "@/components/Header";
import { LiveChart } from "@/components/LiveChart";
import { MetricCard } from "@/components/MetricCard";
import { NodeRedPanel } from "@/components/NodeRedPanel";
import { QuakePanel } from "@/components/QuakePanel";
import { QuizPanel } from "@/components/QuizPanel";
import { UsagePanel } from "@/components/UsagePanel";
import { WeatherPanel } from "@/components/WeatherPanel";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePolling } from "@/hooks/usePolling";
import { useSensorStream, type Series } from "@/hooks/useSensorStream";
import { useI18n } from "@/i18n/LanguageProvider";
import { ALL_DEVICES, filterByDevice } from "@/lib/stats";
import {
  METRICS,
  type DeviceRecord,
  type DevicesResponse,
  type Metric,
  type QuakePayload,
} from "@/lib/types";

/** ลำดับการ์ดในแถวบน — ทั้งหมดอยู่บรรทัดเดียวกัน */
const TOP_ROW_METRICS = [
  "temperature",
  "humidity",
  "co2",
  "light",
  "uv",
  "vibration",
] as const satisfies readonly Metric[];

export function DashboardClient({
  thresholds,
  siteName,
}: {
  thresholds: Thresholds;
  siteName: string;
}) {
  const [paused, setPaused] = useState(false);
  const [device, setDevice] = useState<string>(ALL_DEVICES);
  const { broker, series, devices } = useSensorStream(paused);
  const quakes = usePolling<QuakePayload>("/api/earthquakes", 120_000);
  const { d } = useI18n();

  // ทะเบียนอุปกรณ์ถือไว้ที่นี่ เพื่อให้ทั้งตัวเลือกด้านบนและการ์ดจัดการอุปกรณ์
  // เห็นรายชื่อชุดเดียวกัน และอัปเดตทันทีเมื่อเพิ่ม/ลบ
  const [registered, setRegistered] = useState<DeviceRecord[]>([]);
  const [suggestion, setSuggestion] = useState("dev-A");

  const reloadDevices = useCallback(async () => {
    try {
      const response = await fetch("/api/devices");
      const payload = (await response.json()) as DevicesResponse;
      setRegistered(payload.devices);
      setSuggestion(payload.suggestion);
    } catch {
      // ไม่ต้องทำอะไร คงรายชื่อเดิมไว้
    }
  }, []);

  useEffect(() => {
    void reloadDevices();
  }, [reloadDevices]);

  /** ตัวเลือกอุปกรณ์ = ที่ลงทะเบียนไว้ + ที่เคยส่งค่ามา (เผื่อมีตัวที่ยังไม่ได้ลงทะเบียน) */
  const deviceOptions = useMemo(() => {
    const ids = new Set<string>(registered.map((item) => item.id));
    for (const id of devices) ids.add(id);
    return [...ids].sort();
  }, [registered, devices]);

  const visibleSeries = useMemo<Series>(() => {
    if (device === ALL_DEVICES) return series;
    return {
      temperature: filterByDevice(series.temperature, device),
      humidity: filterByDevice(series.humidity, device),
      vibration: filterByDevice(series.vibration, device),
      light: filterByDevice(series.light, device),
      uv: filterByDevice(series.uv, device),
      co2: filterByDevice(series.co2, device),
    };
  }, [series, device]);

  const latest = useMemo(() => {
    const result = {} as Record<Metric, number | null>;
    for (const metric of METRICS) {
      result[metric] = visibleSeries[metric].at(-1)?.value ?? null;
    }
    return result;
  }, [visibleSeries]);

  return (
    <div className="min-h-screen">
      <Header siteName={siteName} />

      <main className="mx-auto max-w-350 space-y-4 px-4 py-5">
        <AlertBanner
          latest={latest}
          thresholds={thresholds}
          quakes={quakes.data?.quakes ?? []}
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <BrokerBadge broker={broker} />
          </div>

          {/* แสดงตลอด เพื่อให้เลือกดูอุปกรณ์ที่ลงทะเบียนไว้ได้แม้ยังไม่เคยส่งค่า */}
          <div className="flex items-center gap-2">
            <Label htmlFor="device-filter" className="text-xs text-muted-foreground">
              {d.broker.devices}
            </Label>
            <Select
              value={device}
              onValueChange={(value) => setDevice(value ?? ALL_DEVICES)}
            >
              <SelectTrigger id="device-filter" size="sm">
                <SelectValue>
                  {device === ALL_DEVICES ? d.common.all : device}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEVICES}>{d.common.all}</SelectItem>
                {deviceOptions.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                    {devices.includes(id) ? "" : ` · ${d.devices.noData}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DeviceManager
              series={series}
              devices={registered}
              suggestion={suggestion}
              onChanged={reloadDevices}
            />
          </div>
        </div>

        {/* แถวเดียว: อุณหภูมิ · ความชื้น · CO2 · ความสว่าง · ดัชนี UV · แรงสั่นสะเทือน */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {TOP_ROW_METRICS.map((metric) => (
            <MetricCard
              key={metric}
              metric={metric}
              series={visibleSeries[metric]}
              threshold={thresholds[metric]}
            />
          ))}
        </div>

        <LiveChart
          series={visibleSeries}
          paused={paused}
          onTogglePause={() => setPaused((value) => !value)}
        />

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <WeatherPanel />
          <QuakePanel data={quakes.data} error={quakes.error} loading={quakes.loading} />
        </div>

        <UsagePanel />

        <QuizPanel />

        <NodeRedPanel />
      </main>
    </div>
  );
}
