/**
 * ตัวจำลองเซนเซอร์สำหรับทดสอบแดชบอร์ดตอนที่ยังไม่ได้ต่ออุปกรณ์จริง
 *
 *   npm run simulator
 *   npm run simulator -- --url mqtt://192.168.1.50:1883 --devices 3 --interval 1000
 *   npm run simulator -- --names dev-A,dev-C
 *
 * ส่ง payload รูปแบบ sensors/<device>/data
 *   {"deviceId":"dev-A","temperature":28.4,"humidity":62.1,"vibration":0.31,"light":8200,"uv":6.2,"co2":650,"ts":1712345678901}
 *
 * ชื่ออุปกรณ์ตั้งเป็น dev-A, dev-B, ... ให้ตรงกับ DEVICE_ALLOWLIST ที่ตั้งไว้ใน .env.local
 * ถ้าชื่อไม่อยู่ใน allowlist ค่าที่ส่งจะถูกทิ้งและไม่ขึ้นบนแดชบอร์ด
 */
import mqtt from "mqtt";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const url = arg("url", process.env.MQTT_URL ?? "mqtt://localhost:1883");
const deviceCount = Number(arg("devices", "2"));
const intervalMs = Number(arg("interval", "1000"));
const topicPrefix = arg("prefix", "sensors");

const namesArg = arg("names", "");
const deviceNames = namesArg
  ? namesArg.split(",").map((name) => name.trim()).filter(Boolean)
  : Array.from(
      { length: deviceCount },
      (_, index) => `dev-${String.fromCharCode(65 + index)}`,
    );

const devices = deviceNames.map((id, index) => ({
  id,
  temperature: 27 + index * 1.5,
  humidity: 60 - index * 4,
  vibration: 0.3,
  light: 8000 - index * 1500,
  uv: 6 - index,
  co2: 600 + index * 80,
}));

/** เดินสุ่มแบบมีแรงดึงกลับเข้าค่ากลาง เพื่อให้กราฟดูเป็นธรรมชาติ */
function drift(current, center, step, min, max) {
  const next = current + (Math.random() - 0.5) * step + (center - current) * 0.02;
  return Math.min(max, Math.max(min, next));
}

const client = mqtt.connect(url, { clientId: `simulator-${Date.now()}` });

client.on("connect", () => {
  console.log(`[simulator] connected to ${url}`);
  console.log(
    `[simulator] publishing ${devices.length} device(s) every ${intervalMs}ms: ${devices
      .map((device) => device.id)
      .join(", ")}`,
  );
});

client.on("error", (error) => {
  console.error(`[simulator] ${error.message}`);
});

setInterval(() => {
  if (!client.connected) return;

  for (const device of devices) {
    device.temperature = drift(device.temperature, 28, 0.6, 15, 45);
    device.humidity = drift(device.humidity, 60, 1.5, 20, 95);
    // จำลองการสั่นแรงเป็นครั้งคราวเพื่อทดสอบการแจ้งเตือน
    const spike = Math.random() < 0.02 ? Math.random() * 2.5 : 0;
    device.vibration = drift(device.vibration, 0.3, 0.15, 0, 1.2) + spike;
    // LDR: แกว่งกว้างกว่าค่าอื่นเพราะแสงเปลี่ยนเร็ว (เมฆบัง/เปิดปิดไฟ)
    device.light = drift(device.light, 8000, 900, 0, 20000);
    device.uv = drift(device.uv, 6, 0.5, 0, 13);
    device.co2 = drift(device.co2, 650, 40, 400, 2000);

    const payload = {
      deviceId: device.id,
      temperature: Number(device.temperature.toFixed(2)),
      humidity: Number(device.humidity.toFixed(2)),
      vibration: Number(device.vibration.toFixed(3)),
      light: Math.round(device.light),
      uv: Number(device.uv.toFixed(1)),
      co2: Math.round(device.co2),
      ts: Date.now(),
    };

    client.publish(`${topicPrefix}/${device.id}/data`, JSON.stringify(payload), { qos: 0 });
  }
}, intervalMs);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    client.end(true, () => process.exit(0));
  });
}
