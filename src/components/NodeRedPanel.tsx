"use client";

import { useState } from "react";
import { Download, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import type { NodeRedStatus } from "@/lib/nodered";

export function NodeRedPanel() {
  const { d, formatRelative } = useI18n();
  const { data, refresh } = usePolling<NodeRedStatus>("/api/nodered", 15_000);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const sendNow = async () => {
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/nodered", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        sent?: number;
        error?: string;
      };
      setResult(
        response.ok && payload.ok
          ? { ok: true, text: `${d.nodered.sendOk} (${payload.sent ?? 0})` }
          : {
              ok: false,
              text: `${d.nodered.sendFail}: ${payload.error ?? response.status}`,
            },
      );
      refresh();
    } catch (error) {
      setResult({
        ok: false,
        text: `${d.nodered.sendFail}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{d.nodered.title}</CardTitle>
        <CardDescription className="text-[11px]">{d.nodered.hint}</CardDescription>
      </CardHeader>

      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">{d.nodered.status}</dt>
            <dd>
              <Badge variant={data?.enabled ? "secondary" : "outline"}>
                {data?.enabled ? d.nodered.enabled : d.nodered.disabled}
              </Badge>
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">{d.nodered.endpoint}</dt>
            <dd className="truncate font-medium" title={data?.url}>
              {data?.url || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{d.nodered.queued}</dt>
            <dd className="tabular font-medium">{data?.queued ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{d.nodered.sent}</dt>
            <dd className="tabular font-medium text-ok">{data?.sentCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{d.nodered.failed}</dt>
            <dd
              className={cn(
                "tabular font-medium",
                data?.failedCount ? "text-destructive" : undefined,
              )}
            >
              {data?.failedCount ?? 0}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">{d.nodered.lastSent}</dt>
            <dd className="font-medium">{formatRelative(data?.lastSentAt ?? null)}</dd>
          </div>
        </dl>

        {data && !data.url ? (
          <p className="mt-3 text-[11px] text-warn">{d.nodered.notConfigured}</p>
        ) : null}

        {data?.lastError ? (
          <p className="mt-2 text-[11px] wrap-break-word text-destructive">
            {data.lastError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={sendNow} disabled={sending || !data?.url} size="sm">
            <Send />
            {sending ? d.nodered.sending : d.nodered.sendNow}
          </Button>

          {/* render เป็น <a> เพื่อให้ดาวน์โหลดตรง ๆ จึงต้องปิด nativeButton ของ Base UI */}
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href="/api/sensors/export" />}
          >
            <Download />
            {d.nodered.downloadCsv}
          </Button>
        </div>

        {result ? (
          <p
            className={cn(
              "mt-2 text-[11px]",
              result.ok ? "text-ok" : "text-destructive",
            )}
          >
            {result.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
