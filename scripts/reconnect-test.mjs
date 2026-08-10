/**
 * ทดสอบว่า client ต่อกลับเองได้ไหมเมื่อ broker (เว็บ) รีสตาร์ท
 * ใช้ mqtt.js ซึ่งเป็นไลบรารีเดียวกับที่ Node-RED และเว็บใช้
 *
 *   node scripts/reconnect-test.mjs mqtt://localhost:1883
 */
import mqtt from "mqtt";

const url = process.argv[2] ?? "mqtt://localhost:1883";
const client = mqtt.connect(url, { clientId: "reconnect-probe", reconnectPeriod: 2000 });

let published = 0;
let connects = 0;

const stamp = () => new Date().toLocaleTimeString("th-TH");

client.on("connect", () => {
  connects += 1;
  console.log(`[${stamp()}] connect #${connects} (ส่งไปแล้ว ${published} ข้อความ)`);
});
client.on("reconnect", () => console.log(`[${stamp()}] กำลังลองต่อใหม่…`));
client.on("offline", () => console.log(`[${stamp()}] offline — broker หายไป`));
client.on("error", (error) => console.log(`[${stamp()}] error: ${error.message}`));

setInterval(() => {
  if (!client.connected) return;
  client.publish(
    "sensors/dev-F/data",
    JSON.stringify({ temperature: 25, humidity: 50, vibration: 0.2, light: 1000 }),
  );
  published += 1;
}, 1000);
