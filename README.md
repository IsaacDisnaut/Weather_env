# Weather & Sensor Dashboard

ระบบตรวจวัดสภาพแวดล้อมแบบเรียลไทม์ บอร์ด ESP32 อ่านค่าอุณหภูมิ ความชื้น CO₂ แสง UV และแรงสั่นสะเทือน
แล้วส่งผ่าน MQTT มาที่เว็บแดชบอร์ด (Next.js) ซึ่งแสดงกราฟวิ่ง พยากรณ์อากาศ แจ้งเตือนแผ่นดินไหว
และส่งข้อมูลต่อไป Node-RED (บันทึกเป็น CSV เปิดด้วย Excel) กับ Firebase Realtime Database
มีแอป AR บน Android ไว้ส่อง marker หน้างานเพื่อดูค่าของเซนเซอร์จุดนั้น

```
ESP32 + เซนเซอร์ ──WiFi/MQTT──▶ Mosquitto :1883 ──▶ Web Dashboard (Next.js :3000)
   (dev-A … dev-F)              sensors/<id>/data      │
                                                       ├──▶ เบราว์เซอร์  /dashboard (กราฟเรียลไทม์ผ่าน SSE)
                                                       ├──▶ Node-RED :1880 ──▶ data/sensor-readings.csv (Excel)
                                                       ├──▶ Firebase RTDB  tiewwat/live/ubosot/{A,B,C…}
                                                       └──▶ แอป AR บน Android (ส่อง ArUco marker)
```

## สารบัญ

1. [สิ่งที่ต้องมี](#1-สิ่งที่ต้องมี)
2. [เริ่มใช้งานแบบเร็ว](#2-เริ่มใช้งานแบบเร็ว)
3. [ฮาร์ดแวร์และการต่อสาย (GPIO)](#3-ฮาร์ดแวร์และการต่อสาย-gpio)
4. [ตั้งค่า WiFi / MQTT และแฟลช firmware](#4-ตั้งค่า-wifi--mqtt-และแฟลช-firmware)
5. [Web Dashboard](#5-web-dashboard)
6. [Node-RED → Excel](#6-node-red--excel)
7. [Firebase Realtime Database](#7-firebase-realtime-database)
8. [แอป AR บน Android](#8-แอป-ar-บน-android)
9. [ทดสอบโดยไม่มีบอร์ดจริง (simulator)](#9-ทดสอบโดยไม่มีบอร์ดจริง-simulator)
10. [แก้ปัญหาที่เจอบ่อย](#10-แก้ปัญหาที่เจอบ่อย)
11. [โครงสร้างโปรเจค](#11-โครงสร้างโปรเจค)

---

## 1. สิ่งที่ต้องมี

| อย่าง | ใช้ทำอะไร |
| --- | --- |
| Windows 10/11 | สคริปต์ `start-sensor.bat` / `stop-sensor.bat` เขียนไว้สำหรับ Windows |
| [Node.js](https://nodejs.org/) 20 ขึ้นไป | รันเว็บแดชบอร์ดและ Node-RED |
| [Mosquitto](https://mosquitto.org/download/) | MQTT broker ติดตั้งไว้ที่ `C:\Program Files\mosquitto\` (ค่าเริ่มต้นของตัวติดตั้ง) |
| [Arduino IDE](https://www.arduino.cc/en/software) 2.x | แฟลช firmware ลง ESP32 |
| [ngrok](https://ngrok.com/download) (ไม่บังคับ) | เปิดแดชบอร์ดออกอินเทอร์เน็ตให้มือถือต่างเน็ตเวิร์กเข้าได้ |
| Python 3 (ไม่บังคับ) | รัน `simulator.py` ส่งค่าจำลอง |
| Android Studio + JDK 17 (ไม่บังคับ) | build แอป AR |

## 2. เริ่มใช้งานแบบเร็ว

ทำครั้งเดียวตอนติดตั้ง

```bash
git clone https://github.com/IsaacDisnaut/Weather_env.git
cd Weather_env
npm install
cd nodered && npm install && cd ..
copy .env.example .env.local        # แล้วแก้ค่าใน .env.local ตามหัวข้อที่ 5
```

หลังจากนั้นดับเบิลคลิก **`start-sensor.bat`** — เปิด Mosquitto, Node-RED, เว็บเซิร์ฟเวอร์ และอุโมงค์ ngrok
ให้ครบ แล้วเปิดเบราว์เซอร์ไปที่แดชบอร์ดให้เอง ปิดทั้งหมดด้วย **`stop-sensor.bat`**

| บริการ | ที่อยู่ |
| --- | --- |
| แดชบอร์ด | http://localhost:3000/dashboard |
| Node-RED | http://localhost:1880 |
| MQTT | พอร์ต 1883 (TCP) / 9001 (WebSocket) |
| URL สาธารณะ | อ่านชื่อโดเมนจากบรรทัด `Domain:` ใน `Auth.txt` |
| หน้าตรวจสอบ ngrok | http://127.0.0.1:4040 |

`Auth.txt` เก็บ ngrok authtoken กับโดเมนที่จองไว้ ไฟล์นี้ไม่ขึ้น git ต้องสร้างเองในเครื่อง:

```
<ngrok authtoken>
Domain: <ชื่อที่จองไว้>.ngrok-free.dev
```

ถ้าไม่ได้ติดตั้ง ngrok สคริปต์จะข้ามขั้นนี้ให้เอง ปิดถาวรได้ด้วย `NGROK_ENABLED=0` ที่หัวไฟล์ `start-sensor.bat`

## 3. ฮาร์ดแวร์และการต่อสาย (GPIO)

แต่ละจุดตรวจวัด (dev-A … dev-F) ใช้บอร์ดชุดเดียวกัน

| ชิ้นส่วน | หน้าที่ | การเชื่อมต่อ |
| --- | --- | --- |
| ESP32 DevKit (ESP32-WROOM-32) | ตัวควบคุม + WiFi | — |
| Sensirion **SHT45** | อุณหภูมิ / ความชื้น (ความแม่นยำสูง) | I²C แอดเดรส `0x44` |
| Sensirion **SCD41** | CO₂ + อุณหภูมิ / ความชื้น | I²C แอดเดรส `0x62` |
| **CJMCU-TEMT6000** | ความสว่าง | Analog |
| โมดูลวัดแรงสั่นสะเทือน (analog) | แรงสั่นสะเทือน | Analog |
| โมดูล UV (analog) | ดัชนี UV | Analog |

### ตารางต่อสาย

| ขาเซนเซอร์ | ต่อกับ ESP32 | หมายเหตุ |
| --- | --- | --- |
| SHT45 / SCD41 — **SDA** | **GPIO 21** | ต่อขนานกันบนบัส I²C เดียว |
| SHT45 / SCD41 — **SCL** | **GPIO 22** | |
| TEMT6000 — **OUT/SIG** | **GPIO 32** | ADC1 |
| Vibration — **AO** | **GPIO 33** | ADC1 |
| UV — **OUT** | **GPIO 34** | ADC1 (ขา input-only) |
| ทุกตัว — **VCC** | **5V** (ขา VIN/5V) | โมดูลมี regulator บนบอร์ด — ดูข้อควรระวังเรื่องขา analog ด้านล่าง |
| ทุกตัว — **GND** | **GND** | |

```
                ESP32 DevKit
             ┌──────────────────┐
   5V ───────┤ VIN/5V       GND ├─────── GND (ทุกเซนเซอร์)
             │                  │
 SHT45+SCD41 │ GPIO21 (SDA)     │
   SDA ──────┤                  │
   SCL ──────┤ GPIO22 (SCL)     │
             │                  │
 TEMT6000 ───┤ GPIO32 (ADC1)    │
 Vibration ──┤ GPIO33 (ADC1)    │
 UV ─────────┤ GPIO34 (ADC1)    │
             └──────────────────┘
```

### หน้าที่ของแต่ละขา

| GPIO | ชนิด | ต่อกับ | ค่าที่ได้ |
| --- | --- | --- | --- |
| **21** | I²C SDA (ข้อมูล) | SHT45 + SCD41 | อุณหภูมิ ความชื้น CO₂ |
| **22** | I²C SCL (สัญญาณนาฬิกา) | SHT45 + SCD41 | — |
| **32** | Analog (ADC1_CH4) | TEMT6000 | ความสว่าง |
| **33** | Analog (ADC1_CH5) | Vibration | แรงสั่นสะเทือน |
| **34** | Analog (ADC1_CH6), รับเข้าอย่างเดียว | UV | ดัชนี UV |
| 5V / GND | ไฟเลี้ยง | ทุกตัว | — |

#### I²C: GPIO 21 (SDA) และ GPIO 22 (SCL)

- **SDA (GPIO 21)** เป็นสายส่งข้อมูลไป-กลับ ส่วน **SCL (GPIO 22)** เป็นสัญญาณนาฬิกาที่ ESP32 สร้างเอง
  ทั้งสองเป็นขา I²C เริ่มต้นของ ESP32 ใน Arduino และโค้ดเรียกใช้ด้วย `Wire.begin(SDA_PIN, SCL_PIN)`
- **เซนเซอร์ 2 ตัวใช้สายคู่เดียวกันได้** เพราะแต่ละตัวมีแอดเดรสของตัวเอง: SHT45 = `0x44`, SCD41 = `0x62`
  ESP32 เรียกตามแอดเดรส ตัวที่ไม่ถูกเรียกจะไม่ตอบ ให้ต่อ SDA กับ SDA และ SCL กับ SCL แบบขนานกันได้เลย
- **ไม่ต้องต่อ pull-up resistor เพิ่ม:** I²C ต้องมีตัวต้านทานดึงสายขึ้น แต่บอร์ด breakout ของ SHT45 และ SCD41
  ที่ใช้มี pull-up ใส่มาให้บนบอร์ดแล้ว ต่อสายตรงได้เลย
- **ข้อมูลที่ได้:**
  - SHT45: อุณหภูมิและความชื้น อ่านทุก 1 วินาที
  - SCD41: CO₂ อุณหภูมิ และความชื้น มีค่าใหม่ประมาณทุก 5 วินาที
  - firmware รวมอุณหภูมิและความชื้นจาก 2 ตัวเป็น SHT45 70% + SCD41 30%

#### GPIO 32: TEMT6000 (ความสว่าง)

- TEMT6000 เป็น phototransistor ยิ่งสว่าง แรงดันที่ขา OUT ยิ่งสูง ได้ตั้งแต่ 0 ถึง 3.3V
- ESP32 อ่านเป็นตัวเลข 0–4095 (ADC 12 บิต) แล้วแปลงเป็นแรงดัน จากนั้นคำนวณ `lux ≈ แรงดัน × 1000`
- **ข้อจำกัด:**
  - เป็นค่า lux โดยประมาณ ไม่ได้คาลิเบรต
  - ค่าสูงสุดอยู่ราว 3,300 lux แสงแดดจ้าจะทำให้ค่าตันที่จุดนั้น
  - ใช้เทียบความสว่างระหว่างจุดได้ แต่ไม่ใช่ค่าที่วัดได้แม่นยำ

#### GPIO 33: Vibration (แรงสั่นสะเทือน)

- ต่อจากขา **AO** (analog) ของโมดูล ไม่ใช่ขา DO แรงดันขึ้นตามความแรงของการสั่น
- firmware แปลงเป็น `แรงดัน ÷ 3.3` จึงได้ค่า **0–1** ไม่มีหน่วย ไม่ใช่หน่วย g
- **ข้อควรรู้:** ขานี้อ่านทุก 100 ms แต่ส่งเฉพาะค่าที่อ่านได้ล่าสุดทุก 1 วินาที
  การสั่นสั้นๆ ที่เกิดระหว่างรอบจึงมักหลุดไป ถ้าต้องการจับการสั่นจริง
  ควรแก้ firmware ให้ส่ง **ค่าสูงสุดในรอบ 1 วินาที** แทนค่าล่าสุด

#### GPIO 34: UV

- GPIO 34–39 เป็นขา **รับเข้าอย่างเดียว** ไม่มี pull-up/pull-down ภายใน จึงเหมาะกับการอ่าน analog
  แต่ใช้เป็นขาส่งออกไม่ได้
- อ่านแรงดันจากขา OUT ของโมดูล UV ได้แล้ว แต่ **ยังไม่ได้แปลงเป็นดัชนี UV**
  โค้ดตั้ง `uvIndex = 0.0` ไว้ ค่า UV จึงเป็น 0 เสมอ
- ถ้าเป็นโมดูล GUVA-S12SD ที่พบบ่อย สูตรประมาณคือ `UV index ≈ แรงดัน ÷ 0.1`
  ต้องดูรุ่นจริงของโมดูลก่อนใส่สูตร

#### ทำไมเลือกขาเหล่านี้

- **analog ทุกขาอยู่บน ADC1** เพราะ ADC2 (เช่น GPIO 4, 12–15, 25–27) ใช้งานไม่ได้ระหว่างที่ WiFi ทำงาน
  ถ้าย้ายเซนเซอร์ไปขา ADC2 จะอ่านได้แต่ค่าผิด
- **ขาที่ควรเลี่ยง:**
  - GPIO 6–11 ต่อกับ flash ภายในบอร์ด
  - GPIO 0, 2, 5, 12, 15 เป็น strapping pin ถ้ามีอะไรต่ออยู่อาจทำให้บอร์ดบูตไม่ขึ้น
- **เลี้ยงทุกโมดูลด้วย 5V** แต่ขา GPIO ของ ESP32 รับแรงดันได้ไม่เกิน 3.3V
  ขา analog (GPIO 32, 33, 34) ต่อตรงกับขาออกของโมดูล ถ้าโมดูลส่งแรงดันออกมาเกิน 3.3V
  ขาอาจเสียหาย ให้วัดขา OUT/AO ด้วยมัลติมิเตอร์ตอนสว่างที่สุด/สั่นแรงที่สุดก่อนใช้งานจริง
  ถ้าเกิน 3.3V ให้ใส่วงจรแบ่งแรงดัน (เช่น 10 kΩ + 20 kΩ) ระหว่างขาออกของโมดูลกับ GPIO
- **ADC ของ ESP32 ไม่เป็นเชิงเส้นที่ช่วงปลาย:** ค่าใกล้ 0V และเกินราว 3.1V จะเพี้ยน
  ค่าที่อ่านได้ในช่วงนั้นจึงควรใช้แบบประมาณ

### firmware ทำอะไรบ้าง

- อ่าน SHT45 ทุก 1 วินาที, SCD41 ทุกครั้งที่มีค่าใหม่ (ประมาณ 5 วินาที), เซนเซอร์ analog ทุก 100 ms
- **รวมค่าอุณหภูมิ/ความชื้น** จากสองเซนเซอร์ SHT45 70% + SCD41 30% ถ้าตัวใดเงียบเกินเวลา
  (SHT45 3 วินาที, SCD41 10 วินาที) จะใช้ตัวที่เหลืออย่างเดียว
- ส่ง MQTT ทุก 1 วินาที ไปที่ topic `sensors/<DEVICE_ID>/data`

```json
{"deviceId":"dev-A","temperature":26.5,"humidity":56.8,"vibration":0.0,"light":456.1,"uv":0.0,"co2":761}
```

| ค่า | หน่วย | ที่มา |
| --- | --- | --- |
| `temperature` | °C | SHT45 + SCD41 (fusion) |
| `humidity` | %RH | SHT45 + SCD41 (fusion) |
| `co2` | ppm | SCD41 (`null` ถ้ายังไม่มีค่า) |
| `light` | lux (ประมาณ) | TEMT6000 คิดจาก แรงดัน × 1000 |
| `vibration` | 0–1 | แรงดันที่อ่านได้ ÷ 3.3V |
| `uv` | UVI | **ตอนนี้ส่ง 0 เสมอ** — ยังไม่ได้ใส่สมการแปลงค่าของเซนเซอร์ UV ใน `readAnalogSensors()` |

## 4. ตั้งค่า WiFi / MQTT และแฟลช firmware

โค้ดอยู่ที่ [`firmware/`](firmware/) แยกโฟลเดอร์ละอุปกรณ์ (`sensor_node_dev_A` … `sensor_node_dev_F`)
ทุกตัวเหมือนกัน ต่างกันแค่ `MQTT_TOPIC` และ `DEVICE_ID`

### 4.1 ติดตั้ง Arduino IDE

1. **File → Preferences → Additional boards manager URLs** ใส่
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. **Boards Manager** ติดตั้ง **esp32** by Espressif
3. **Library Manager** ติดตั้ง
   - `PubSubClient` (Nick O'Leary)
   - `ArduinoJson` เวอร์ชัน **7.x**
   - `Adafruit SHT4x Library` (จะชวนติดตั้ง Adafruit BusIO / Unified Sensor ด้วย ให้กด Install all)
   - `Sensirion I2C SCD4x`

### 4.2 ตั้งค่า WiFi และ broker

ชื่อ/รหัส WiFi และ IP ของ broker อยู่ในไฟล์ `secrets.h` ของแต่ละโฟลเดอร์ ซึ่ง **ไม่ขึ้น git**
ครั้งแรกให้ก๊อปจากไฟล์ตัวอย่าง

```bat
copy firmware\sensor_node_dev_A\secrets.example.h firmware\sensor_node_dev_A\secrets.h
```

แล้วแก้ค่า

```cpp
const char* WIFI_SSID     = "ชื่อ WiFi";
const char* WIFI_PASSWORD = "รหัส WiFi";
const char* MQTT_SERVER   = "192.168.1.100";   // IP ของคอมที่รัน Mosquitto
```

- **ESP32 ต่อได้เฉพาะ WiFi 2.4 GHz** ถ้าเราเตอร์แยกชื่อ 2.4/5 GHz ต้องใส่ชื่อของ 2.4 GHz
- หา IP ของคอมด้วย `ipconfig` ดูบรรทัด **IPv4 Address** ของการ์ด WiFi ที่ต่อวงเดียวกับบอร์ด
- ถ้า IP ของคอมเปลี่ยนบ่อย ให้ตั้ง DHCP reservation ในเราเตอร์ ไม่งั้นต้องแฟลชใหม่ทุกครั้ง

### 4.3 แฟลช

1. เปิด `firmware/sensor_node_dev_X/sensor_node_dev_X.ino`
2. **Tools → Board → ESP32 Dev Module** และเลือก **Port** ที่บอร์ดเสียบอยู่
3. กด **Upload** (บางบอร์ดต้องกดปุ่ม **BOOT** ค้างไว้ตอนขึ้น `Connecting...`)
4. เปิด **Serial Monitor** ที่ **115200 baud** ควรเห็น `SHT45 OK`, `SCD41 OK`, `WiFi connected`,
   `Connecting MQTT...connected` แล้วตามด้วย payload ทุก 1 วินาที

### 4.4 เพิ่มอุปกรณ์ตัวใหม่ (เช่น dev-G)

1. ก๊อปโฟลเดอร์ `sensor_node_dev_F` เป็น `sensor_node_dev_G` แล้วเปลี่ยนชื่อไฟล์ `.ino` ให้ตรงกับชื่อโฟลเดอร์
2. แก้ `MQTT_TOPIC = "sensors/dev-G/data"` และ `DEVICE_ID = "dev-G"`
3. เพิ่ม `dev-G` ในแดชบอร์ด (ปุ่ม **จัดการอุปกรณ์**) และใน `DEVICE_ALLOWLIST` ของ `.env.local`
   — ค่าจากอุปกรณ์ที่ไม่ได้ลงทะเบียนจะถูกทิ้ง
4. ถ้าใช้แอป AR ให้ผูก marker ใน `ar-markers/markers.json` ด้วย (หัวข้อที่ 8)

## 5. Web Dashboard

Next.js 15 + shadcn/ui อยู่ที่ [`src/`](src/) รันด้วย `npm run dev` (หรือผ่าน `start-sensor.bat`)

### 5.1 ค่าตั้งใน `.env.local`

ก๊อปจาก [`.env.example`](.env.example) ทุกค่ามีคำอธิบายในไฟล์ ค่าที่ต้องดูหลัก ๆ

| ตัวแปร | ความหมาย |
| --- | --- |
| `MQTT_MODE` | `external` = ต่อ Mosquitto ตาม `MQTT_URL` (ใช้กับ `start-sensor.bat`), `embedded` = เว็บเป็น broker เอง ไม่ต้องลง Mosquitto |
| `MQTT_URL`, `MQTT_TOPICS` | broker และ topic ที่ subscribe (ค่าเริ่มต้น `"sensors/#"` ต้องมีเครื่องหมายคำพูด) |
| `DEVICE_ALLOWLIST` | รายชื่ออุปกรณ์ที่รับค่า คั่นด้วย comma |
| `NEXT_PUBLIC_SITE_NAME/LAT/LON` | ชื่อและพิกัดสถานี ใช้กับพยากรณ์อากาศและระยะแผ่นดินไหว |
| `EARTHQUAKE_RADIUS_KM`, `EARTHQUAKE_MIN_MAGNITUDE` | เกณฑ์แจ้งเตือนแผ่นดินไหว |
| `ALERT_*_MIN/MAX` | เกณฑ์แจ้งเตือนค่าเซนเซอร์แต่ละตัว |
| `NODERED_*` | ปลายทาง Node-RED (หัวข้อที่ 6) |
| `FIREBASE_*` | Firebase (หัวข้อที่ 7) |
| `AR_INGEST_TOKEN` | token ที่แอป AR ต้องแนบตอนส่งสถิติ ตั้งเมื่อเปิดออกอินเทอร์เน็ต |

### 5.2 ฟังก์ชันการทำงาน

- **กราฟเรียลไทม์** ของอุณหภูมิ ความชื้น CO₂ ความสว่าง ดัชนี UV และแรงสั่นสะเทือน เลือกช่วงเวลาได้ 5 นาที ถึง 6 ชั่วโมง
- **แจ้งเตือนอัตโนมัติ** เมื่อค่าเกินเกณฑ์ที่ตั้งไว้ใน `.env.local`
- **พยากรณ์อากาศ** รายชั่วโมงและล่วงหน้า 7 วัน ตามพิกัดของสถานี
- **แจ้งเตือนแผ่นดินไหว** จาก USGS พร้อมระยะทางจากสถานี
- **จัดการอุปกรณ์** เพิ่ม/ลบได้จากปุ่มบนแดชบอร์ด ตั้งชื่อเองแล้วระบบบอก MQTT topic ให้ไปตั้งที่อุปกรณ์
- **เลือกดูทีละอุปกรณ์** หรือดูรวมทุกตัว
- **บันทึกลงไฟล์** ผ่าน Node-RED เป็น `data/sensor-readings.csv` เปิดด้วย Excel ได้เลย
- **ส่งขึ้น Firebase** ค่าล่าสุดของแต่ละอุปกรณ์
- **สลับภาษา** ไทย–อังกฤษ
- **เกมตอบคำถาม** สแกน marker `quiz-1` ด้วยแอป AR แล้วเล่นเกมปรนัย 5 ข้อ คำถามสุ่มจากเนื้อหาใน `ar-content/`
  ทุกครั้งที่เริ่มเล่น ปิดท้ายด้วยคำถามความรู้สึก "อยากให้ภาพเหล่านี้ได้รับการอนุรักษ์ไว้มากแค่ไหน" (0–5)
  ซึ่งไม่นับคะแนน ผลเก็บที่ `data/quiz-results.jsonl` และขึ้นการ์ด "เกมตอบคำถามจิตรกรรม" บนแดชบอร์ด ดาวน์โหลดเป็น CSV ได้
- **สถิติการใช้งานแอป AR** จุดไหนถูกสแกนกี่ครั้ง ดูนานเท่าไร มีกี่เครื่อง และ feedback จากผู้ใช้ ดาวน์โหลดเป็น CSV ได้

### 5.3 API ที่ใช้บ่อย

| Endpoint | ใช้ทำอะไร |
| --- | --- |
| `GET /api/sensors/snapshot?points=300` | ค่าล่าสุด สถิติ และค่าย้อนหลังของทุก metric + สถานะ broker |
| `GET /api/stream` | SSE ส่งค่าใหม่ทุกครั้งที่ MQTT ได้รับ (หน้าเว็บกับแอป AR ใช้ตัวนี้) |
| `GET /api/nodered` | สถานะการส่งต่อ Node-RED |
| `GET /api/firebase` | สถานะการส่งขึ้น Firebase |
| `GET /api/weather`, `GET /api/earthquakes` | พยากรณ์อากาศ / แผ่นดินไหว |
| `/api/devices` | รายชื่ออุปกรณ์ที่ลงทะเบียน |
| `/api/usage`, `/api/feedback`, `/api/quiz` | ข้อมูลจากแอป AR |

## 6. Node-RED → Excel

เว็บรวบรวมค่าที่ได้จาก MQTT แล้ว POST เป็นชุดไปที่ Node-RED ทุก `NODERED_FLUSH_MS` (ค่าเริ่มต้น 10 วินาที)
Node-RED เขียนต่อท้ายไฟล์ **`data/sensor-readings.csv`** (มี BOM ให้ Excel อ่านภาษาไทยถูก)

- flow ต้นฉบับคือ [`nodered/flow.json`](nodered/flow.json) — ครั้งแรกที่รัน `npm run nodered` จะก๊อปเป็น `flows.json` ให้
- แก้ flow ใน Node-RED แล้วอยากกลับไปเป็นต้นฉบับ: `npm --prefix nodered run reset-flow`
- ปิดการส่งชั่วคราว: `NODERED_ENABLED=false`
- เช็กสถานะ: http://localhost:3000/api/nodered

## 7. Firebase Realtime Database

เว็บเขียนทับ **ค่าล่าสุด** ของแต่ละอุปกรณ์ทุก `FIREBASE_FLUSH_MS` (ค่าเริ่มต้น 2 วินาที) โดยตัด `dev-` ออกจากชื่อ

```
tiewwat/live/ubosot/
  A: { temp: 26.5, rh: 56.8, lux: 456, uv: 0, co2: 761, vib: 0, ts: 1793092229875, demo: false }
  B: { ... }
```

### 7.1 ตั้งค่า

ใส่ใน `.env.local` (`FIREBASE_DATABASE_URL`, `FIREBASE_BASE_PATH` มีค่าให้แล้วใน `.env.example`)
แล้วเลือกวิธียืนยันตัวตนด้วย `FIREBASE_AUTH_MODE`

| โหมด | ตั้งค่าเพิ่ม | ใช้เมื่อ |
| --- | --- | --- |
| `secret` | `FIREBASE_DB_SECRET` จาก **Project settings → Service accounts → Database secrets** | ง่ายที่สุด ข้าม rules ทั้งหมด — เก็บไว้ใน `.env.local` เท่านั้น |
| `password` | `FIREBASE_EMAIL`, `FIREBASE_PASSWORD` | ทำงานตาม rules ของโปรเจค (ดูด้านล่าง) |
| `none` | — | rules เปิดให้เขียนได้โดยไม่ล็อกอิน |

**โหมด `password`** — rules ของ `tiewwat` อนุญาตให้เขียน `live/{building}/{zone}` เฉพาะผู้ใช้ที่มี
`devices/{uid}` เป็น `"{building}/{zone}"` หรือ `"*"`

1. **Authentication → Sign-in method** เปิด **Email/Password**
2. **Authentication → Users → Add user** สร้างบัญชีสำหรับเซิร์ฟเวอร์ (ไม่ต้องเป็นอีเมลจริง
   และอย่าใช้บัญชี Google ของตัวเอง เพราะไม่มีรหัสผ่านใน Firebase Auth)
3. ก๊อป **User UID** แล้วที่ **Realtime Database → Data** เพิ่ม `devices/<UID>` = `"*"`
4. restart `npm run dev`

### 7.2 ตรวจสอบ

เปิด http://localhost:3000/api/firebase

- `sentCount` เพิ่มขึ้นเรื่อย ๆ และ `lastError: null` = ส่งได้
- `pending` ว่างและ `sentCount: 0` = ยังไม่มีค่าเซนเซอร์เข้ามา ให้เช็ก broker ก่อน (หัวข้อที่ 10)
- ล็อกอินไม่ผ่านระบบจะรอ 15 วินาที → 30 วินาที → … สูงสุด 5 นาทีก่อนลองใหม่ (`nextAuthRetryAt`)
  เพื่อไม่ให้ Firebase บล็อก (`TOO_MANY_ATTEMPTS_TRY_LATER`)

## 8. แอป AR บน Android

[`android-ar/`](android-ar/) ส่องกล้องไปที่ ArUco marker แล้วค่าเซนเซอร์ ข้อมูลจุดติดตั้ง และวิดีโอ
ของจุดนั้นจะลอยขึ้นมาบนภาพจริง ดึงข้อมูลจาก `/api/sensors/snapshot` และ `/api/stream` ของเว็บนี้
ค่าในแอปกับบนเว็บจึงตรงกันเสมอ

### 8.1 build และติดตั้ง

ต้องใช้ Android Studio (Ladybug ขึ้นไป) + JDK 17 และมือถือ **Android 7.0+ ที่รองรับ ARCore**

1. มือถือเปิด **Developer options → USB debugging** แล้วเสียบสาย USB
2. รัน (ใส่ URL ของแดชบอร์ดที่มือถือเข้าถึงได้)

   ```bat
   android-ar\build-install.bat http://192.168.1.100:3000
   ```

   สคริปต์ build APK ติดตั้ง และเปิดแอปให้ในคำสั่งเดียว ถ้าตั้ง `AR_INGEST_TOKEN` ไว้ใน `.env.local`
   จะอ่านไปใส่ในแอปให้เอง — path ของ SDK/JDK ในสคริปต์ตั้งไว้ตามเครื่องที่พัฒนา แก้ให้ตรงกับเครื่องตัวเองก่อน
3. เปลี่ยนที่อยู่แดชบอร์ดภายหลังได้ในแอป: กดค้างที่แถบสถานะ → **ที่อยู่ Dashboard**

### 8.2 marker และเนื้อหา

| สิ่งที่ต้องทำ | ที่ไหน |
| --- | --- |
| พิมพ์ marker (ArUco `DICT_4X4_50`) ติดตรงจุดวางเซนเซอร์ อย่าตัดขอบขาวทิ้ง | [`ar-markers/`](ar-markers/) |
| ผูกหมายเลข marker กับอุปกรณ์ (`arucoId` → `deviceId`) | [`ar-markers/markers.json`](ar-markers/markers.json) |
| ข้อความ / รูปของแต่ละจุด | `ar-content/info/<device>/info.txt` (ไทย), `info.en.txt` (อังกฤษ) |
| วิดีโอของแต่ละจุด | `ar-content/video/<device>/` |
| marker ประวัติสถานที่ (`site-1`) และเกมตอบคำถาม (`quiz-1`) | `ar-content/history/`, `ar-content/video360/` |

แก้เนื้อหาใน `ar-content/` แล้วมีผลทันทีโดยไม่ต้อง build แอปใหม่

### 8.3 ใช้งานต่างเน็ตเวิร์ก

- **เสียบสาย USB**: `adb reverse tcp:3000 tcp:3000` แล้วตั้งที่อยู่ในแอปเป็น `http://localhost:3000`
- **ผ่านอินเทอร์เน็ต**: เปิด ngrok (ใน `start-sensor.bat`) แล้วใช้ URL สาธารณะ และตั้ง `AR_INGEST_TOKEN`
  กันคนแปลกปลอมส่งข้อมูลปลอมเข้ามา

รายละเอียดทั้งหมดและการแก้ปัญหาอยู่ใน [`android-ar/README.md`](android-ar/README.md)

## 9. ทดสอบโดยไม่มีบอร์ดจริง (simulator)

มีตัวจำลองสองแบบ ส่งค่าแบบเดียวกับ firmware ไปที่ broker

```bash
# Python — แก้ BROKER_HOST / DEVICE_IDS ที่หัวไฟล์ แล้วกด Run ใน VS Code
python simulator.py

# Node.js — ส่ง dev-A..dev-F ทุก 1 วินาที
npm run simulator -- --devices 6 --interval 1000
npm run simulator -- --url mqtt://192.168.1.50:1883 --devices 3
```

## 10. แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
| --- | --- |
| Serial ขึ้น `WiFi connection FAILED` | ชื่อ/รหัสใน `secrets.h` ผิด หรือเป็น WiFi 5 GHz (ESP32 ใช้ได้แค่ 2.4 GHz) |
| Serial ขึ้น `MQTT failed, rc=-2` | หา broker ไม่เจอ: `MQTT_SERVER` ไม่ใช่ IP ปัจจุบันของคอม, Mosquitto ไม่ได้รัน, หรือ Windows Firewall บล็อกพอร์ต 1883 |
| `SHT45 ERROR` / `SCD41 Start Error` | สาย SDA/SCL สลับกัน หรือไม่ได้จ่ายไฟ 5V/GND ให้โมดูล |
| แดชบอร์ดขึ้น broker `offline` | Mosquitto ไม่ได้รัน — รัน `start-sensor.bat` หรือตั้ง `MQTT_MODE=embedded` |
| บอร์ดส่งแล้วแต่แดชบอร์ดไม่ขึ้น | ชื่ออุปกรณ์ไม่อยู่ใน **จัดการอุปกรณ์** / `DEVICE_ALLOWLIST` — ดูรายชื่อที่ถูกทิ้งได้ที่ `rejectedDevices` ใน `/api/sensors/snapshot` |
| มือถือเปิด `http://<IP>:3000` ไม่ได้ | ไม่ได้อยู่ WiFi วงเดียวกัน หรือ Firewall ยังไม่อนุญาต Node.js ที่พอร์ต 3000 |
| ค่า UV เป็น 0 ตลอด | ปกติของ firmware ตอนนี้ — ยังไม่ได้ใส่สมการแปลงค่า UV (หัวข้อที่ 3) |
| Firebase `Permission denied` / `INVALID_LOGIN_CREDENTIALS` | ดูหัวข้อที่ 7.1 |
| ไฟล์ CSV ไม่มีข้อมูลเพิ่ม | Node-RED ไม่ได้รัน หรือ `NODERED_URL` ผิด — ดู `/api/nodered` |

## 11. โครงสร้างโปรเจค

```
├── src/                    เว็บแดชบอร์ด (Next.js)
│   ├── app/dashboard/      หน้าแดชบอร์ด
│   ├── app/api/            REST + SSE endpoints
│   ├── components/         UI (shadcn/ui)
│   ├── i18n/               ข้อความไทย–อังกฤษ
│   └── lib/                MQTT, Node-RED, Firebase, พยากรณ์อากาศ, แผ่นดินไหว
├── firmware/               โค้ด ESP32 แยกตามอุปกรณ์ (secrets.h ไม่ขึ้น git)
├── mosquitto/              mosquitto.conf
├── nodered/                Node-RED + flow บันทึก CSV
├── android-ar/             แอป AR (Kotlin + ARCore + OpenCV)
├── ar-markers/             รูป marker + markers.json
├── ar-content/             ข้อความ รูป วิดีโอ ที่แสดงในแอป AR
├── docs/                   คู่มือผู้ใช้ รูปประกอบ
├── scripts/                serve, simulator, สร้างเอกสาร
├── data/                   ไฟล์ข้อมูลตอนรัน (CSV, jsonl) — ไม่ขึ้น git
├── simulator.py            ตัวจำลองค่าเซนเซอร์ (Python)
├── start-sensor.bat        เปิดระบบทั้งหมด
└── stop-sensor.bat         ปิดระบบทั้งหมด
```
