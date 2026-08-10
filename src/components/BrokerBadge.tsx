"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import type { BrokerStatus } from "@/lib/types";

const STATE_CLASS: Record<BrokerStatus["state"], string> = {
  online: "text-ok",
  connecting: "text-warn",
  offline: "text-muted-foreground",
  error: "text-destructive",
};

const DOT_CLASS: Record<BrokerStatus["state"], string> = {
  online: "bg-ok live-dot",
  connecting: "bg-warn",
  offline: "bg-muted-foreground",
  error: "bg-destructive",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground">
      {label}: <span className="text-foreground">{children}</span>
    </span>
  );
}

export function BrokerBadge({ broker }: { broker: BrokerStatus | null }) {
  const { d, formatRelative } = useI18n();
  const state = broker?.state ?? "connecting";

  return (
    <Card className="py-0">
      <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs">
        <span className={cn("flex items-center gap-2 font-medium", STATE_CLASS[state])}>
          <span className={cn("size-2.5 rounded-full", DOT_CLASS[state])} aria-hidden />
          {d.broker.title}: {d.broker.state[state]}
        </span>

        <Badge variant={broker?.mode === "embedded" ? "default" : "secondary"}>
          {broker?.mode === "embedded" ? d.broker.embedded : d.broker.external}
        </Badge>

        <span className="text-muted-foreground">{broker?.url ?? "—"}</span>

        {broker?.mode === "embedded" ? (
          <Field label={d.broker.clients}>
            <span className="tabular">{broker.clientCount}</span>
            {broker.clientIds.length > 0 ? (
              <span className="text-muted-foreground"> ({broker.clientIds.join(", ")})</span>
            ) : null}
          </Field>
        ) : null}

        <Field label={d.broker.topics}>{broker?.topics.join(", ") ?? "—"}</Field>
        <Field label={d.broker.messages}>
          <span className="tabular">{broker?.messageCount ?? 0}</span>
        </Field>
        <Field label={d.broker.lastMessage}>
          {formatRelative(broker?.lastMessageAt ?? null)}
        </Field>

        {broker?.lastError ? (
          <span className="text-destructive">{broker.lastError}</span>
        ) : null}

        {broker?.rejectedDevices.length ? (
          <span className="text-warn" title={d.broker.rejectedHint}>
            {d.broker.rejected}: {broker.rejectedDevices.join(", ")} (
            <span className="tabular">{broker.rejectedCount}</span>)
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
