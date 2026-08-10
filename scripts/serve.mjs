/**
 * เปิด Next.js แล้วยิง request ไปหนึ่งครั้งเพื่อปลุก MQTT broker ในตัวให้เริ่มทำงานทันที
 *
 * ทำแบบนี้เพราะ instrumentation.ts ของ Next.js ถูกคอมไพล์สำหรับ edge runtime ด้วย
 * ซึ่ง resolve โมดูล 'net' ของ Node ไม่ได้ จึงเปิด TCP server จากตรงนั้นไม่ได้
 * ส่วน route handler เป็น nodejs runtime เปิดได้ปกติ — แค่ต้องมีคนเรียกสักครั้ง
 *
 *   node scripts/serve.mjs dev     -> next dev
 *   node scripts/serve.mjs start   -> next start
 */
import { spawn } from "node:child_process";

const mode = process.argv[2] === "start" ? "start" : "dev";
const port = process.env.PORT ?? "3000";
const warmupUrl = `http://localhost:${port}/api/sensors/snapshot?points=1`;

const child = spawn("npx", ["next", mode], {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));

let started = false;

async function warmup() {
  for (let attempt = 0; attempt < 60 && !started; attempt += 1) {
    try {
      const response = await fetch(warmupUrl, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        started = true;
        console.log("[serve] broker warmed up");
        return;
      }
    } catch {
      // เซิร์ฟเวอร์ยังไม่พร้อม ลองใหม่
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!started) {
    console.warn(`[serve] ปลุก broker ไม่สำเร็จ ลองเปิด ${warmupUrl} เองในเบราว์เซอร์`);
  }
}

void warmup();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill();
    process.exit(0);
  });
}
