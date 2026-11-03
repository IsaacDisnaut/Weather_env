import "server-only";
import mqtt, { type MqttClient } from "mqtt";
import { mqttConfig } from "@/lib/config";
import { isDeviceRegistered } from "@/lib/devices";
import { parseMessage } from "@/lib/mqtt/parse";
import { sensorStore } from "@/lib/mqtt/store";
import { startFirebaseForwarder } from "@/lib/firebase";
import { startNodeRedForwarder } from "@/lib/nodered";

const globalRef = globalThis as typeof globalThis & {
  __mqttClient?: MqttClient;
};

/**
 * เชื่อม broker แบบ lazy singleton — เรียกจาก route handler ตัวไหนก็ได้
 * ต่อจริงครั้งเดียวต่อ process แล้ว mqtt.js จะ reconnect ให้เองเมื่อหลุด
 */
export function ensureMqtt(): MqttClient {
  if (globalRef.__mqttClient) return globalRef.__mqttClient;

  const client = mqtt.connect(mqttConfig.url, {
    clientId: mqttConfig.clientId,
    username: mqttConfig.username,
    password: mqttConfig.password,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
    clean: true,
  });

  client.on("connect", () => {
    sensorStore.setStatus({ state: "online", lastError: null });
    client.subscribe(mqttConfig.topics, { qos: 0 }, (error) => {
      if (error) {
        sensorStore.setStatus({ state: "error", lastError: error.message });
      }
    });
  });

  client.on("reconnect", () => sensorStore.setStatus({ state: "connecting" }));
  client.on("close", () => sensorStore.setStatus({ state: "offline" }));
  client.on("offline", () => sensorStore.setStatus({ state: "offline" }));

  client.on("error", (error) => {
    sensorStore.setStatus({ state: "error", lastError: error.message });
  });

  client.on("message", (topic, payload) => {
    for (const reading of parseMessage(topic, payload)) {
      // อุปกรณ์ที่ไม่ได้ลงทะเบียนไว้จะไม่ถูกเก็บและไม่ถูกส่งต่อไป Node-RED
      if (!isDeviceRegistered(reading.deviceId)) {
        sensorStore.rejectDevice(reading.deviceId);
        continue;
      }
      sensorStore.push(reading);
    }
  });

  globalRef.__mqttClient = client;
  startNodeRedForwarder();
  startFirebaseForwarder();
  return client;
}
