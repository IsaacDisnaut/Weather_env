"use client";

import { useState } from "react";
import { Check, Copy, Plus, Settings2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/LanguageProvider";
import type { Series } from "@/hooks/useSensorStream";
import { cn } from "@/lib/utils";
import {
  METRIC_DIGITS,
  METRICS,
  type DeviceRecord,
  type Metric,
} from "@/lib/types";

/** ค่าล่าสุดของอุปกรณ์หนึ่งตัว ดึงจาก series ที่สตรีมอยู่แล้ว */
function latestFor(series: Series, deviceId: string) {
  let ts: number | null = null;
  const values = {} as Partial<Record<Metric, number>>;

  for (const metric of METRICS) {
    for (let index = series[metric].length - 1; index >= 0; index -= 1) {
      const point = series[metric][index];
      if (point.deviceId !== deviceId) continue;
      values[metric] = point.value;
      if (ts === null || point.ts > ts) ts = point.ts;
      break;
    }
  }

  return { ts, values };
}

export function DeviceManager({
  series,
  devices,
  suggestion,
  onChanged,
}: {
  series: Series;
  devices: DeviceRecord[];
  suggestion: string;
  /** ให้ตัวแม่โหลดรายชื่อใหม่ ตัวเลือกอุปกรณ์ด้านบนจะได้อัปเดตตาม */
  onChanged: () => void | Promise<void>;
}) {
  const { d, formatNumber, formatRelative } = useI18n();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const pendingId = (name.trim() || suggestion).trim();

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: pendingId }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(
          payload.error === "duplicate"
            ? d.devices.errorDuplicate
            : payload.error === "invalid"
              ? d.devices.errorInvalid
              : d.devices.errorGeneric,
        );
        return;
      }

      setName("");
      await onChanged();
    } catch {
      setError(d.devices.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (device: DeviceRecord) => {
    if (!window.confirm(d.devices.confirmRemove.replace("{name}", device.id))) return;

    const response = await fetch(`/api/devices?id=${encodeURIComponent(device.id)}`, {
      method: "DELETE",
    });
    if (response.ok) await onChanged();
  };

  const copyTopic = async (topic: string) => {
    await navigator.clipboard.writeText(topic);
    setCopied(topic);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Settings2 />
            {d.devices.manage}
          </Button>
        }
      />

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d.devices.title}</DialogTitle>
          <DialogDescription>{d.devices.subtitle}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {/* ---------- ฟอร์มเพิ่มอุปกรณ์ ---------- */}
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-56 flex-1">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !saving) void add();
              }}
              placeholder={suggestion || d.devices.namePlaceholder}
              aria-label={d.devices.namePlaceholder}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{d.devices.nameHint}</p>
          </div>

          <Button onClick={add} disabled={saving || !pendingId}>
            <Plus />
            {saving ? d.devices.adding : d.devices.add}
          </Button>
        </div>

        {/* topic ที่จะได้ อัปเดตตามที่พิมพ์ เพื่อเอาไปตั้งที่อุปกรณ์ได้เลย */}
        {pendingId ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {d.devices.topicPreview}:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
              sensors/{pendingId}/data
            </code>
          </p>
        ) : null}

        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

        {/* ---------- รายการอุปกรณ์ + ค่าล่าสุด ---------- */}
        {devices.length === 0 ? (
          <p className="mt-4 text-xs text-warn">{d.devices.empty}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {devices.map((device) => {
              const { ts, values } = latestFor(series, device.id);
              const live = ts !== null;

              return (
                <li
                  key={device.id}
                  className="rounded-lg border bg-muted/40 p-3 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        live ? "bg-ok live-dot" : "bg-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="text-sm font-medium">{device.label}</span>

                    <button
                      type="button"
                      onClick={() => copyTopic(device.topic)}
                      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                      title={d.devices.copy}
                    >
                      {device.topic}
                      {copied === device.topic ? (
                        <Check className="size-3 text-ok" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>

                    <span className="ml-auto flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {d.devices.lastSeen}: {live ? formatRelative(ts) : d.devices.noData}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(device)}
                        aria-label={`${d.devices.remove} ${device.id}`}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </span>
                  </div>

                  {live ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-5">
                      {METRICS.map((metric) =>
                        values[metric] === undefined ? null : (
                          <span key={metric} className="text-[11px] text-muted-foreground">
                            {d.metrics[metric]}:{" "}
                            <span className="tabular font-medium text-foreground">
                              {formatNumber(values[metric], METRIC_DIGITS[metric])}
                            </span>{" "}
                            {d.units[metric]}
                          </span>
                        ),
                      )}
                    </div>
                  ) : (
                    <Badge variant="outline" className="mt-2 ml-5">
                      {d.devices.noData}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
