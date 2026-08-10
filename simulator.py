"""
ตัวจำลองเซนเซอร์สำหรับ Weather Dashboard
=========================================

กดปุ่ม Run ใน VS Code (หรือสั่ง `python simulator.py`) แล้วมันจะเริ่มส่งค่าเข้า MQTT
หยุดด้วยการกด Ctrl+C หรือกดปุ่มหยุดใน VS Code — ปิดโปรแกรมเมื่อไหร่ ค่าก็หยุดส่งทันที
ไม่มีอะไรทำงานค้างเบื้องหลัง

ต้องเปิด MQTT broker ไว้ก่อน (รัน start-sensor.bat)

ต้องมี paho-mqtt:
    pip install paho-mqtt
"""

from __future__ import annotations

import json
import random
import sys
import time
from dataclasses import dataclass

try:
    from paho.mqtt import client as mqtt
except ImportError:
    sys.exit("ไม่พบไลบรารี paho-mqtt — ติดตั้งด้วย:  pip install paho-mqtt")


# ---------------------------------------------------------------------------
# ตั้งค่าตรงนี้
# ---------------------------------------------------------------------------

BROKER_HOST = "localhost"   # IP ของเครื่องที่รัน broker
BROKER_PORT = 1883
TOPIC_PREFIX = "sensors"

# ชื่ออุปกรณ์ต้องอยู่ใน DEVICE_ALLOWLIST ของ .env.local ไม่งั้นค่าจะถูกทิ้ง
DEVICE_IDS = ["dev-A", "dev-B"]

INTERVAL_SECONDS = 1.0

# โอกาสจำลองการสั่นแรงผิดปกติ เพื่อทดสอบการแจ้งเตือน (0 = ปิด)
VIBRATION_SPIKE_CHANCE = 0.02


@dataclass
class Sensor:
    """ค่าปัจจุบันของอุปกรณ์หนึ่งตัว พร้อมขอบเขตที่ค่าจะแกว่งอยู่"""

    device_id: str
    temperature: float
    humidity: float
    vibration: float
    light: float

    def drift(self, current: float, center: float, step: float,
              low: float, high: float) -> float:
        """เดินสุ่มแบบมีแรงดึงกลับเข้าค่ากลาง เพื่อให้กราฟดูเป็นธรรมชาติ"""
        nxt = current + random.uniform(-step, step) + (center - current) * 0.02
        return max(low, min(high, nxt))

    def next_reading(self) -> dict:
        self.temperature = self.drift(self.temperature, 28, 0.6, 15, 45)
        self.humidity = self.drift(self.humidity, 60, 1.5, 20, 95)
        self.light = self.drift(self.light, 8000, 900, 0, 20000)

        spike = random.uniform(0, 2.5) if random.random() < VIBRATION_SPIKE_CHANCE else 0
        self.vibration = self.drift(self.vibration, 0.3, 0.15, 0, 1.2) + spike

        return {
            "deviceId": self.device_id,
            "temperature": round(self.temperature, 2),
            "humidity": round(self.humidity, 2),
            "vibration": round(self.vibration, 3),
            "light": round(self.light),
            "ts": int(time.time() * 1000),
        }


def build_sensors() -> list[Sensor]:
    return [
        Sensor(
            device_id=device_id,
            temperature=27 + index * 1.5,
            humidity=60 - index * 4,
            vibration=0.3,
            light=8000 - index * 1500,
        )
        for index, device_id in enumerate(DEVICE_IDS)
    ]


def main() -> int:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="python-simulator")

    try:
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=30)
    except OSError as error:
        print(f"เชื่อมต่อ broker ที่ {BROKER_HOST}:{BROKER_PORT} ไม่ได้ — {error}")
        print("เปิด broker ก่อนด้วย start-sensor.bat แล้วลองใหม่")
        return 1

    client.loop_start()

    sensors = build_sensors()
    print(f"เชื่อมต่อ {BROKER_HOST}:{BROKER_PORT} แล้ว")
    print(f"ส่งค่าของ {', '.join(DEVICE_IDS)} ทุก {INTERVAL_SECONDS} วินาที")
    print("กด Ctrl+C เพื่อหยุด\n")

    sent = 0
    try:
        while True:
            for sensor in sensors:
                payload = sensor.next_reading()
                client.publish(
                    f"{TOPIC_PREFIX}/{sensor.device_id}/data",
                    json.dumps(payload),
                    qos=0,
                )
                sent += 1

            latest = sensors[0]
            print(
                f"\r  ส่งแล้ว {sent} ข้อความ | {latest.device_id}: "
                f"{latest.temperature:5.1f}°C  {latest.humidity:5.1f}%  "
                f"{latest.vibration:5.2f}g  {latest.light:6.0f}lx",
                end="",
                flush=True,
            )
            time.sleep(INTERVAL_SECONDS)

    except KeyboardInterrupt:
        print(f"\n\nหยุดแล้ว — ส่งไปทั้งหมด {sent} ข้อความ")
        return 0

    finally:
        # ปิดการเชื่อมต่อให้เรียบร้อยเสมอ ไม่ให้มีอะไรค้างหลังปิดโปรแกรม
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    raise SystemExit(main())
