import "server-only";
// ใช้ "net" ไม่ใช่ "node:net" เพราะ webpack ของ Next.js จัดการ scheme "node:" ในเลเยอร์ instrumentation ไม่ได้
import { createServer, type Server } from "net";
import type { Aedes, Client } from "aedes";
import type { WebSocketServer } from "ws";
import { embeddedBrokerConfig, mqttConfig } from "@/lib/config";
import { isDeviceRegistered } from "@/lib/devices";
import { parseMessage } from "@/lib/mqtt/parse";
import { sensorStore } from "@/lib/mqtt/store";
import { matchesAny } from "@/lib/mqtt/topic";
import { startFirebaseForwarder } from "@/lib/firebase";
import { startNodeRedForwarder } from "@/lib/nodered";

type BrokerHandle = {
  aedes: Aedes;
  tcp: Server;
  wss: WebSocketServer;
};

const globalRef = globalThis as typeof globalThis & {
  __embeddedBroker?: Promise<BrokerHandle>;
};

/**
 * เปิด MQTT broker ในตัวเซิร์ฟเวอร์นี้เอง ไม่ต้องพึ่ง Mosquitto
 * อุปกรณ์ต่อเข้ามาที่พอร์ต 1883 (TCP) หรือ 9001 (WebSocket) ได้โดยตรง
 * เก็บเป็น promise บน globalThis เพื่อไม่ให้เปิดซ้ำเมื่อถูกเรียกพร้อมกันหลายที่
 */
export function startEmbeddedBroker(): Promise<BrokerHandle> {
  if (globalRef.__embeddedBroker) return globalRef.__embeddedBroker;

  globalRef.__embeddedBroker = createEmbeddedBroker().catch((error: unknown) => {
    // ล้าง cache ไว้ให้ลองใหม่ได้ ถ้าเปิดไม่สำเร็จ
    globalRef.__embeddedBroker = undefined;
    throw error;
  });

  return globalRef.__embeddedBroker;
}

async function createEmbeddedBroker(): Promise<BrokerHandle> {
  /**
   * โหลดตอน runtime และสั่งให้ webpack ไม่ยุ่งด้วย
   * เพราะ qlobber (dependency ของ aedes) เรียก require('stream') แบบ bare
   * ซึ่ง bundler ฝั่ง server ของ Next.js resolve ไม่ได้ และ serverExternalPackages
   * ก็ไม่ครอบคลุมโค้ดที่ถูกเรียกจาก instrumentation.ts
   */
  const { Aedes: AedesClass } = (await import(
    /* webpackIgnore: true */ "aedes"
  )) as typeof import("aedes");
  const { WebSocketServer: WSServer, createWebSocketStream } = (await import(
    /* webpackIgnore: true */ "ws"
  )) as typeof import("ws");

  // aedes v1 ต้องสร้างผ่าน factory แบบ async — new Aedes() ใช้ไม่ได้แล้ว
  const aedes = await AedesClass.createBroker();

  // aedes ไม่ได้ประกาศ type ของรายการ client ไว้ จึงเก็บเองจาก event
  const connected = new Set<string>();
  const sync = () => sensorStore.setClients([...connected].sort());

  aedes.on("client", (client: Client) => {
    connected.add(client.id);
    sync();
    console.log(`[broker] client connected: ${client.id}`);
  });

  aedes.on("clientDisconnect", (client: Client) => {
    connected.delete(client.id);
    sync();
    console.log(`[broker] client disconnected: ${client.id}`);
  });

  aedes.on("clientError", (client: Client, error: Error) => {
    connected.delete(client.id);
    sync();
    console.log(`[broker] client error ${client.id}: ${error.message}`);
  });

  aedes.on("connectionError", (_client: Client, error: Error) => {
    console.log(`[broker] connection error: ${error.message}`);
  });

  aedes.on("publish", (packet, client) => {
    // client เป็น null สำหรับข้อความที่ broker สร้างเอง ($SYS) — ข้ามไป
    if (!client || !packet.topic) return;
    if (!matchesAny(mqttConfig.topics, packet.topic)) return;

    const payload = Buffer.isBuffer(packet.payload)
      ? packet.payload
      : Buffer.from(String(packet.payload));

    for (const reading of parseMessage(packet.topic, payload)) {
      if (!isDeviceRegistered(reading.deviceId)) {
        sensorStore.rejectDevice(reading.deviceId);
        continue;
      }
      sensorStore.push(reading);
    }
  });

  const tcp = createServer(aedes.handle);
  tcp.on("error", (error) => {
    sensorStore.setStatus({ state: "error", lastError: error.message });
    console.error(`[broker] TCP ${embeddedBrokerConfig.port}: ${error.message}`);
  });
  tcp.listen(embeddedBrokerConfig.port, embeddedBrokerConfig.host, () => {
    sensorStore.setStatus({ state: "online", lastError: null });
    console.log(
      `[broker] MQTT listening on ${embeddedBrokerConfig.host}:${embeddedBrokerConfig.port}`,
    );
  });

  // MQTT over WebSocket เผื่อให้เบราว์เซอร์หรือ Node-RED ต่อตรงได้
  const wss = new WSServer({ port: embeddedBrokerConfig.wsPort });
  wss.on("connection", (socket) => {
    aedes.handle(createWebSocketStream(socket));
  });
  wss.on("error", (error) => {
    console.error(`[broker] WS ${embeddedBrokerConfig.wsPort}: ${error.message}`);
  });
  wss.on("listening", () => {
    console.log(`[broker] MQTT over WebSocket on port ${embeddedBrokerConfig.wsPort}`);
  });

  startNodeRedForwarder();
  startFirebaseForwarder();
  return { aedes, tcp, wss };
}
