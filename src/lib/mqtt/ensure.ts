import "server-only";
import { brokerMode } from "@/lib/config";

/**
 * ให้แน่ใจว่า broker (หรือ client ในโหมด external) ทำงานอยู่
 * ปกติ instrumentation.ts เรียกตั้งแต่บูตแล้ว ตัวนี้กันกรณี hot-reload ในโหมด dev
 */
export async function ensureBroker(): Promise<void> {
  // เรียกซ้ำได้ไม่มีผล — กันกรณี hot-reload หลังต่อ broker ไปแล้ว forwarder ตัวใหม่จะไม่ถูกเริ่ม
  const { startFirebaseForwarder } = await import("@/lib/firebase");
  startFirebaseForwarder();

  if (brokerMode === "embedded") {
    const { startEmbeddedBroker } = await import("@/lib/mqtt/broker");
    await startEmbeddedBroker();
    return;
  }

  const { ensureMqtt } = await import("@/lib/mqtt/client");
  ensureMqtt();
}
