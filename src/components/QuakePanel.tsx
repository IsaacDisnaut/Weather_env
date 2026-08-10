"use client";

import { useState } from "react";
import { ExternalLink, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import type { QuakePayload } from "@/lib/types";

function magnitudeClass(magnitude: number): string {
  if (magnitude >= 6) return "bg-destructive/15 text-destructive";
  if (magnitude >= 4.5) return "bg-warn/15 text-warn";
  return "bg-muted text-muted-foreground";
}

export function QuakePanel({
  data,
  error,
  loading,
  compact = false,
}: {
  data: QuakePayload | null;
  error: string | null;
  loading: boolean;
  /** ย่อให้สูงเท่าการ์ดค่าเซนเซอร์ เวลาวางอยู่ในแถวเดียวกัน */
  compact?: boolean;
}) {
  const { d, formatNumber, formatDateTime, formatRelative } = useI18n();
  const [nearbyOnly, setNearbyOnly] = useState(false);

  const quakes = data
    ? nearbyOnly
      ? data.quakes.filter((quake) => quake.distanceKm <= data.radiusKm)
      : data.quakes
    : [];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm">{d.quake.title}</CardTitle>
        <CardDescription className="text-[11px]">{d.quake.subtitle}</CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Checkbox
              id="nearby-only"
              checked={nearbyOnly}
              onCheckedChange={(checked) => setNearbyOnly(checked === true)}
            />
            <Label htmlFor="nearby-only" className="text-[11px] text-muted-foreground">
              {d.quake.filterNearby}
            </Label>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent>
        {loading && !data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-20 w-full" />
            ))}
          </div>
        ) : error && !data ? (
          <p className="text-sm text-destructive">
            {d.common.error}: {error}
          </p>
        ) : quakes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.quake.none}</p>
        ) : (
          <ul
            className={cn(
              "space-y-2 overflow-y-auto pr-1",
              compact ? "max-h-48" : "max-h-105",
            )}
          >
            {quakes.map((quake) => (
              <li
                key={quake.id}
                className={cn(
                  "rounded-lg border bg-muted/40 p-3",
                  quake.alert && "border-destructive/50 bg-destructive/5",
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "tabular grid size-11 shrink-0 place-items-center rounded-lg text-sm font-bold",
                      magnitudeClass(quake.magnitude),
                    )}
                  >
                    {formatNumber(quake.magnitude, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={quake.place}>
                      {quake.place}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(quake.time)} · {formatRelative(quake.time)}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    {d.quake.distance}:{" "}
                    <span className="tabular text-foreground">
                      {formatNumber(quake.distanceKm, 0)} km
                    </span>
                  </span>
                  <span>
                    {d.quake.depth}:{" "}
                    <span className="tabular text-foreground">
                      {formatNumber(quake.depthKm, 0)} km
                    </span>
                  </span>
                  {quake.tsunami ? (
                    <Badge variant="destructive">
                      <Waves /> {d.quake.tsunami}
                    </Badge>
                  ) : null}
                  <a
                    href={quake.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {d.quake.viewOnUsgs}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
