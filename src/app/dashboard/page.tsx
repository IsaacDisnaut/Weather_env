import { DashboardClient } from "@/components/DashboardClient";
import { alertThresholds, siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <DashboardClient
      thresholds={{
        temperature: alertThresholds.temperature,
        humidity: alertThresholds.humidity,
        // Infinity ส่งข้าม RSC ไม่ได้ ใช้ค่าจำกัดแทนสำหรับขอบล่างของแรงสั่นสะเทือน
        vibration: { min: 0, max: alertThresholds.vibration.max },
        light: alertThresholds.light,
        uv: alertThresholds.uv,
        co2: alertThresholds.co2,
      }}
      siteName={siteConfig.name}
    />
  );
}
