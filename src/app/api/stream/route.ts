import { ensureBroker } from "@/lib/mqtt/ensure";
import { sensorStore } from "@/lib/mqtt/store";
import type { BrokerStatus, Reading, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** สตรีมค่าจาก MQTT ไปยังเบราว์เซอร์ผ่าน Server-Sent Events */
export async function GET(request: Request) {
  await ensureBroker();

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };

      const onReading = (reading: Reading) => send({ type: "reading", payload: reading });
      const onStatus = (status: BrokerStatus) => send({ type: "status", payload: status });

      // heartbeat กัน proxy ตัดการเชื่อมต่อตอนไม่มีข้อมูลเข้ามา
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 20_000);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        sensorStore.bus.off("reading", onReading);
        sensorStore.bus.off("status", onStatus);
        try {
          controller.close();
        } catch {
          // stream ถูกปิดไปแล้ว
        }
      }

      send({ type: "snapshot", payload: sensorStore.snapshot() });

      sensorStore.bus.on("reading", onReading);
      sensorStore.bus.on("status", onStatus);
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
