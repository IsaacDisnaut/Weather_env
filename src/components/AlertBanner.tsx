"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useI18n } from "@/i18n/LanguageProvider";
import { METRIC_DIGITS, METRICS, type Metric, type Quake } from "@/lib/types";

export type Thresholds = Record<Metric, { min: number; max: number }>;

export function AlertBanner({
  latest,
  thresholds,
  quakes,
}: {
  latest: Record<Metric, number | null>;
  thresholds: Thresholds;
  quakes: Quake[];
}) {
  const { d, formatNumber, formatRelative } = useI18n();

  const sensorAlerts = METRICS.flatMap((metric) => {
    const value = latest[metric];
    if (value === null) return [];
    const { min, max } = thresholds[metric];
    if (value <= max && value >= min) return [];
    return [
      d.alerts.sensorOut
        .replace("{metric}", d.metrics[metric])
        .replace("{value}", formatNumber(value, METRIC_DIGITS[metric]))
        .replace("{unit}", d.units[metric]),
    ];
  });

  const quakeAlerts = quakes.filter((quake) => quake.alert);

  if (sensorAlerts.length === 0 && quakeAlerts.length === 0) {
    return (
      <Alert className="text-ok">
        <CheckCircle2 />
        <AlertTitle>{d.alerts.none}</AlertTitle>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{d.alerts.title}</AlertTitle>
      <AlertDescription>
        <ul className="space-y-1">
          {sensorAlerts.map((text) => (
            <li key={text}>{text}</li>
          ))}
          {quakeAlerts.length > 0 ? (
            <li>
              {quakeAlerts.length} {d.quake.alertBanner} — M
              {formatNumber(quakeAlerts[0].magnitude, 1)} {quakeAlerts[0].place} (
              {formatNumber(quakeAlerts[0].distanceKm, 0)} km,{" "}
              {formatRelative(quakeAlerts[0].time)})
            </li>
          ) : null}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
