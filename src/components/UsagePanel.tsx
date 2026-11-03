"use client";

import { useState } from "react";
import { Download, MessageSquare, Scan, Star, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import type { UsageSummary } from "@/lib/types";

const RANGES = [
  { key: "7", days: 7 },
  { key: "30", days: 30 },
  { key: "all", days: 0 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/**
 * สรุปการใช้งานแอป AR — จุดไหนถูกสแกนกี่ครั้ง ใช้งานรวมนานเท่าไร และ feedback ที่ส่งเข้ามา
 * ข้อมูลมาจาก data/usage-events.jsonl กับ data/feedback.jsonl ที่แอปมือถือส่งมาเป็นชุด
 */
export function UsagePanel() {
  const { d, formatNumber, formatRelative } = useI18n();
  const [range, setRange] = useState<RangeKey>("7");

  const days = RANGES.find((item) => item.key === range)?.days ?? 0;
  const query = days > 0 ? `?days=${days}` : "";
  const { data } = usePolling<UsageSummary>(`/api/usage${query}`, 30_000);

  const rangeLabel: Record<RangeKey, string> = {
    "7": d.usage.range7,
    "30": d.usage.range30,
    all: d.usage.rangeAll,
  };

  /** 95000 -> "1 นาที" / "1m" — ใช้หน่วยที่ใหญ่ที่สุดที่ยังไม่เป็นศูนย์ ให้อ่านผ่านตาได้เร็ว */
  const duration = (ms: number): string => {
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}${d.usage.unitSeconds}`;
    const minutes = Math.round(totalSeconds / 60);
    if (minutes < 60) return `${minutes}${d.usage.unitMinutes}`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0
      ? `${hours}${d.usage.unitHours}`
      : `${hours}${d.usage.unitHours} ${rest}${d.usage.unitMinutes}`;
  };

  const totals = data?.totals;
  const points = data?.points ?? [];
  const feedback = data?.feedback ?? [];
  // แถบในตารางเทียบกับจุดที่ถูกสแกนมากที่สุด จึงเห็นได้ทันทีว่าจุดไหนคนสนใจ
  const busiest = points[0]?.scans ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{d.usage.title}</CardTitle>
        <CardDescription className="text-[11px]">{d.usage.hint}</CardDescription>

        <CardAction className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(value) => setRange(value as RangeKey)}>
            <SelectTrigger size="sm" aria-label={d.usage.title}>
              <SelectValue>{rangeLabel[range]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {rangeLabel[item.key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(
            [
              ["scans", d.usage.downloadScans],
              ["sessions", d.usage.downloadSessions],
              ["feedback", d.usage.downloadFeedback],
            ] as const
          ).map(([what, label]) => (
            <Button
              key={what}
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={`/api/usage/export?what=${what}${days > 0 ? `&days=${days}` : ""}`} />}
            >
              <Download />
              {label}
            </Button>
          ))}
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <Stat icon={<Scan className="size-3" />} label={d.usage.scans} value={totals?.scans ?? 0} />
          <Stat label={d.usage.sessions} value={totals?.sessions ?? 0} />
          <Stat
            icon={<Timer className="size-3" />}
            label={d.usage.usageTime}
            value={duration(totals?.usageMs ?? 0)}
          />
          <Stat label={d.usage.avgSession} value={duration(totals?.avgSessionMs ?? 0)} />
          <Stat label={d.usage.installs} value={totals?.installs ?? 0} />
          <Stat
            icon={<Star className="size-3" />}
            label={d.usage.avgRating}
            value={
              totals?.avgRating != null ? `${formatNumber(totals.avgRating, 1)} / 5` : "—"
            }
            tone={totals?.avgRating != null && totals.avgRating < 3 ? "warn" : undefined}
          />
        </dl>

        {/* ---------- จำนวนสแกนรายจุด ---------- */}
        <section>
          <h3 className="mb-2 text-xs font-medium">{d.usage.pointsTitle}</h3>

          {points.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{d.usage.noScans}</p>
          ) : (
            <ul className="space-y-1.5">
              {points.map((point) => (
                <li key={point.deviceId} className="text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">
                      {point.label}
                      {point.location ? (
                        <span className="text-muted-foreground"> · {point.location}</span>
                      ) : null}
                      {point.arucoId !== null ? (
                        <span className="text-muted-foreground"> · #{point.arucoId}</span>
                      ) : null}
                    </span>
                    <span className="tabular shrink-0 font-medium">{point.scans}</span>
                  </div>

                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${busiest > 0 ? Math.max(3, (point.scans / busiest) * 100) : 0}%`,
                      }}
                    />
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    <span>
                      {d.usage.dwell} {duration(point.avgDwellMs)}
                    </span>
                    <span>
                      {point.uniqueVisitors} {d.usage.visitors}
                    </span>
                    <span>
                      {d.usage.lastScan} {formatRelative(point.lastScanAt || null)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- feedback ---------- */}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <MessageSquare className="size-3" />
            {d.usage.feedbackTitle}
            {totals?.feedback ? (
              <span className="text-muted-foreground">({totals.feedback})</span>
            ) : null}
          </h3>

          {feedback.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{d.usage.noFeedback}</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {feedback.map((entry) => (
                <li key={entry.id} className="rounded-md border p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "font-medium",
                        entry.rating !== null && entry.rating <= 2 ? "text-destructive" : "text-ok",
                      )}
                    >
                      {entry.rating !== null
                        ? "★".repeat(entry.rating) + "☆".repeat(5 - entry.rating)
                        : d.usage.unrated}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatRelative(entry.ts)}
                    </span>
                    {entry.deviceLabel ? (
                      <span className="text-[11px] text-muted-foreground">
                        {d.usage.onPoint} {entry.deviceLabel}
                      </span>
                    ) : null}
                  </div>

                  {entry.tags.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {entry.message ? (
                    <p className="mt-1.5 wrap-break-word whitespace-pre-line">{entry.message}</p>
                  ) : null}

                  {entry.contact ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {d.usage.contact}: {entry.contact}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "warn";
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className={cn("tabular font-medium", tone === "warn" ? "text-warn" : undefined)}>
        {value}
      </dd>
    </div>
  );
}
