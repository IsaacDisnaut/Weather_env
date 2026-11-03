#pragma once

// ก๊อปไฟล์นี้เป็น secrets.h ในโฟลเดอร์เดียวกัน แล้วใส่ค่าจริง (secrets.h ไม่ขึ้น git)

// ESP32 ต่อได้เฉพาะ WiFi 2.4 GHz
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// IP ของคอมที่รัน Mosquitto (ดูได้จาก ipconfig) — บอร์ดต้องอยู่ใน WiFi วงเดียวกับคอม
const char* MQTT_SERVER = "192.168.1.100";
