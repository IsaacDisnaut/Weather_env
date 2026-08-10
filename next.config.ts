import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mqtt.js ships a browser build; keep the real node build on the server side.
  // aedes/ws ต้องอยู่นอก bundle ด้วย เพราะ dependency ของ aedes (qlobber)
  // เรียก require('stream') แบบ bare ซึ่ง webpack ฝั่ง server resolve ไม่ได้
  serverExternalPackages: ["mqtt", "aedes", "ws"],
};

export default nextConfig;
