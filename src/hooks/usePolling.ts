"use client";

import { useCallback, useEffect, useState } from "react";

export type PollingState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
};

/** ดึง JSON จาก endpoint ซ้ำตามรอบเวลาที่กำหนด */
export function usePolling<T>(url: string, intervalMs: number): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
        setData(payload as T);
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(load, intervalMs);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, intervalMs, nonce]);

  return { data, error, loading, refresh };
}
