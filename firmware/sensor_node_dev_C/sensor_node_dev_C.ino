#include <WiFi.h>
#include <Wire.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include <Adafruit_SHT4x.h>
#include "SensirionI2cScd4x.h"


// =====================================================
// WIFI
// =====================================================

// ชื่อ/รหัส WiFi และ IP ของ broker อยู่ใน secrets.h (ไม่ขึ้น git)
// ครั้งแรกให้ก๊อป secrets.example.h เป็น secrets.h แล้วแก้ค่า
#include "secrets.h"


// =====================================================
// MQTT
// =====================================================

// MQTT_SERVER (IP ของคอมที่รัน Mosquitto) ตั้งใน secrets.h
const int   MQTT_PORT   = 1883;

const char* MQTT_TOPIC = "sensors/dev-C/data";

const char* DEVICE_ID = "dev-C";


// =====================================================
// I2C
// =====================================================

#define SDA_PIN 21
#define SCL_PIN 22

#define SHT45_ADDR 0x44
#define SCD41_ADDR 0x62


// =====================================================
// ANALOG SENSOR
// =====================================================

// CJMCU-TEMT6000
#define LIGHT_PIN 32

// Vibration Sensor
#define VIBRATION_PIN 33

// UV Sensor
#define UV_PIN 34


// =====================================================
// ADC
// =====================================================

#define ADC_RESOLUTION 12

#define ADC_MAX 4095.0

#define ADC_VREF 3.3


// =====================================================
// SAMPLING INTERVAL
// =====================================================

// SHT45 อ่านทุก 1 วินาที
const unsigned long SHT45_INTERVAL = 1000;

// Analog อ่านทุก 100 ms
const unsigned long ANALOG_INTERVAL = 100;

// ตรวจสอบ SCD41 ทุก 100 ms
const unsigned long SCD41_CHECK_INTERVAL = 100;

// ส่ง MQTT ทุก 1 วินาที
const unsigned long MQTT_INTERVAL = 1000;


// =====================================================
// SENSOR TIMEOUT
// =====================================================

const unsigned long SHT45_TIMEOUT = 3000;

const unsigned long SCD41_TIMEOUT = 10000;


// =====================================================
// FUSION WEIGHT
// =====================================================

// SHT45 = 70%
// SCD41 = 30%

const float SHT_WEIGHT = 0.7;

const float SCD_WEIGHT = 0.3;


// =====================================================
// OBJECT
// =====================================================

Adafruit_SHT4x sht45;

SensirionI2cScd4x scd41;

WiFiClient espClient;

PubSubClient mqttClient(espClient);


// =====================================================
// SENSOR DATA
// =====================================================

struct SensorData
{
    // =================================================
    // SHT45
    // =================================================

    float shtTemperature = 0.0;

    float shtHumidity = 0.0;

    unsigned long shtTimestamp = 0;

    bool shtValid = false;


    // =================================================
    // SCD41
    // =================================================

    float scdTemperature = 0.0;

    float scdHumidity = 0.0;

    uint16_t co2 = 0;

    unsigned long scdTimestamp = 0;

    bool scdValid = false;


    // =================================================
    // TEMT6000
    // =================================================

    int lightADC = 0;

    float lightVoltage = 0.0;

    float lightLux = 0.0;


    // =================================================
    // VIBRATION
    // =================================================

    int vibrationADC = 0;

    float vibrationVoltage = 0.0;

    float vibration = 0.0;


    // =================================================
    // UV
    // =================================================

    int uvADC = 0;

    float uvVoltage = 0.0;

    float uvIndex = 0.0;


    // =================================================
    // ANALOG TIMESTAMP
    // =================================================

    unsigned long analogTimestamp = 0;
};


SensorData data;


// =====================================================
// FUSED DATA
// =====================================================

float fusedTemperature = 0.0;

float fusedHumidity = 0.0;

bool fusedValid = false;


// =====================================================
// TIMERS
// =====================================================

unsigned long lastSHT45 = 0;

unsigned long lastAnalog = 0;

unsigned long lastSCD41 = 0;

unsigned long lastMQTT = 0;

unsigned long lastMQTTAttempt = 0;

const unsigned long MQTT_RETRY_INTERVAL = 5000;


// =====================================================
// SETUP
// =====================================================

void setup()
{
    Serial.begin(115200);

    delay(1000);


    // =================================================
    // I2C
    // =================================================

    Wire.begin(
        SDA_PIN,
        SCL_PIN
    );


    // =================================================
    // ADC
    // =================================================

    analogReadResolution(
        ADC_RESOLUTION
    );


    // =================================================
    // ANALOG INPUT
    // =================================================

    pinMode(
        LIGHT_PIN,
        INPUT
    );

    pinMode(
        VIBRATION_PIN,
        INPUT
    );

    pinMode(
        UV_PIN,
        INPUT
    );


    // =================================================
    // HEADER
    // =================================================

    Serial.println();

    Serial.println(
        "=========================================="
    );

    Serial.println(
        "       ESP32 SENSOR FUSION + MQTT"
    );

    Serial.println(
        "=========================================="
    );


    Serial.println();

    Serial.println(
        "I2C Sensors:"
    );

    Serial.println(
        "SHT45 = 0x44"
    );

    Serial.println(
        "SCD41 = 0x62"
    );


    Serial.println();

    Serial.println(
        "Analog Sensors:"
    );

    Serial.println(
        "TEMT6000  = GPIO 32"
    );

    Serial.println(
        "Vibration = GPIO 33"
    );

    Serial.println(
        "UV        = GPIO 34"
    );


    // =================================================
    // INITIALIZE SHT45
    // =================================================

    Serial.println();

    Serial.println(
        "Initializing SHT45..."
    );


    if (!sht45.begin(&Wire))
    {
        Serial.println(
            "SHT45 ERROR"
        );
    }
    else
    {
        Serial.println(
            "SHT45 OK"
        );


        sht45.setPrecision(
            SHT4X_HIGH_PRECISION
        );


        sht45.setHeater(
            SHT4X_NO_HEATER
        );
    }


    // =================================================
    // INITIALIZE SCD41
    // =================================================

    Serial.println();

    Serial.println(
        "Initializing SCD41..."
    );


    scd41.begin(
        Wire,
        SCD41_ADDR
    );


    uint16_t error;

    char errorMessage[256];


    // =================================================
    // STOP PREVIOUS MEASUREMENT
    // =================================================

    error =
        scd41.stopPeriodicMeasurement();


    if (error)
    {
        Serial.print(
            "SCD41 Stop Error: "
        );


        errorToString(
            error,
            errorMessage,
            sizeof(errorMessage)
        );


        Serial.println(
            errorMessage
        );
    }


    delay(500);


    // =================================================
    // START PERIODIC MEASUREMENT
    // =================================================

    error =
        scd41.startPeriodicMeasurement();


    if (error)
    {
        Serial.print(
            "SCD41 Start Error: "
        );


        errorToString(
            error,
            errorMessage,
            sizeof(errorMessage)
        );


        Serial.println(
            errorMessage
        );
    }
    else
    {
        Serial.println(
            "SCD41 OK"
        );
    }


    // =================================================
    // WIFI
    // =================================================

    connectWiFi();


    // =================================================
    // MQTT
    // =================================================

    mqttClient.setServer(
        MQTT_SERVER,
        MQTT_PORT
    );


    // buffer ค่าเริ่มต้น 256 byte เผื่อไว้ให้ JSON
    mqttClient.setBufferSize(
        512
    );


    // =================================================
    // WAIT FOR SCD41
    // =================================================

    Serial.println();

    Serial.println(
        "Waiting for SCD41..."
    );

    delay(5000);


    Serial.println();

    Serial.println(
        "=========================================="
    );

    Serial.println(
        "             SYSTEM READY"
    );

    Serial.println(
        "=========================================="
    );

    Serial.println();
}


// =====================================================
// LOOP
// =====================================================

void loop()
{
    unsigned long now =
        millis();


    // =================================================
    // WIFI
    // =================================================

    if (
        WiFi.status() !=
        WL_CONNECTED
    )
    {
        connectWiFi();
    }


    // =================================================
    // MQTT
    // =================================================

    mqttClient.loop();


    // connect() ค้างได้หลายวินาทีถ้าหา broker ไม่เจอ จึงเว้นช่วงไม่ให้ลองถี่จนอ่านเซนเซอร์ไม่ทัน
    if (
        !mqttClient.connected() &&
        now - lastMQTTAttempt >= MQTT_RETRY_INTERVAL
    )
    {
        lastMQTTAttempt = now;

        reconnectMQTT();
    }


    // =================================================
    // SHT45
    // =================================================

    if (
        now - lastSHT45 >=
        SHT45_INTERVAL
    )
    {
        lastSHT45 = now;

        readSHT45(now);
    }


    // =================================================
    // ANALOG SENSORS
    // =================================================

    if (
        now - lastAnalog >=
        ANALOG_INTERVAL
    )
    {
        lastAnalog = now;

        readAnalogSensors(now);
    }


    // =================================================
    // SCD41
    // =================================================

    if (
        now - lastSCD41 >=
        SCD41_CHECK_INTERVAL
    )
    {
        lastSCD41 = now;

        readSCD41(now);
    }


    // =================================================
    // FUSION + MQTT
    // =================================================

    if (
        now - lastMQTT >=
        MQTT_INTERVAL
    )
    {
        lastMQTT = now;


        updateFusion(
            now
        );


        publishMQTT(
            now
        );
    }
}


// =====================================================
// WIFI CONNECT
// =====================================================

void connectWiFi()
{
    Serial.println();

    Serial.print(
        "Connecting WiFi: "
    );

    Serial.println(
        WIFI_SSID
    );


    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD
    );


    int retry = 0;


    while (
        WiFi.status() != WL_CONNECTED &&
        retry < 30
    )
    {
        delay(500);

        Serial.print(".");

        retry++;
    }


    Serial.println();


    if (
        WiFi.status() ==
        WL_CONNECTED
    )
    {
        Serial.println(
            "WiFi connected"
        );


        Serial.print(
            "ESP32 IP: "
        );

        Serial.println(
            WiFi.localIP()
        );
    }
    else
    {
        Serial.println(
            "WiFi connection FAILED"
        );
    }
}


// =====================================================
// MQTT CONNECT
// =====================================================

void reconnectMQTT()
{
    if (
        WiFi.status() !=
        WL_CONNECTED
    )
    {
        return;
    }


    Serial.print(
        "Connecting MQTT..."
    );


    String clientID =
        String("ESP32_") +
        DEVICE_ID;


    if (
        mqttClient.connect(
            clientID.c_str()
        )
    )
    {
        Serial.println(
            "connected"
        );


        Serial.print(
            "MQTT Server: "
        );

        Serial.println(
            MQTT_SERVER
        );


        Serial.print(
            "MQTT Topic: "
        );

        Serial.println(
            MQTT_TOPIC
        );
    }
    else
    {
        Serial.print(
            "MQTT failed, rc="
        );

        Serial.println(
            mqttClient.state()
        );
    }
}


// =====================================================
// READ SHT45
// =====================================================

void readSHT45(
    unsigned long timestamp
)
{
    sensors_event_t humidity;

    sensors_event_t temperature;


    bool success =
        sht45.getEvent(
            &humidity,
            &temperature
        );


    if (success)
    {
        data.shtTemperature =
            temperature.temperature;


        data.shtHumidity =
            humidity.relative_humidity;


        data.shtTimestamp =
            timestamp;


        data.shtValid =
            true;
    }
    else
    {
        data.shtValid =
            false;
    }
}


// =====================================================
// READ SCD41
// =====================================================

void readSCD41(
    unsigned long timestamp
)
{
    uint16_t error;

    bool dataReady =
        false;


    error =
        scd41.getDataReadyStatus(
            dataReady
        );


    if (error)
    {
        return;
    }


    // ไม่มีข้อมูลใหม่
    if (!dataReady)
    {
        return;
    }


    uint16_t co2;

    float temperature;

    float humidity;


    error =
        scd41.readMeasurement(
            co2,
            temperature,
            humidity
        );


    if (error)
    {
        data.scdValid =
            false;

        return;
    }


    // =================================================
    // SAVE SCD41 DATA
    // =================================================

    data.co2 =
        co2;


    data.scdTemperature =
        temperature;


    data.scdHumidity =
        humidity;


    data.scdTimestamp =
        timestamp;


    data.scdValid =
        true;
}


// =====================================================
// READ ANALOG SENSORS
// =====================================================

void readAnalogSensors(
    unsigned long timestamp
)
{
    // =================================================
    // TEMT6000
    // =================================================

    data.lightADC =
        analogRead(
            LIGHT_PIN
        );


    data.lightVoltage =
        (
            data.lightADC /
            ADC_MAX
        )
        *
        ADC_VREF;


    // -------------------------------------------------
    // TEMT6000
    // Approximate Lux
    // -------------------------------------------------

    data.lightLux =
        data.lightVoltage *
        1000.0;


    // =================================================
    // VIBRATION
    // =================================================

    data.vibrationADC =
        analogRead(
            VIBRATION_PIN
        );


    data.vibrationVoltage =
        (
            data.vibrationADC /
            ADC_MAX
        )
        *
        ADC_VREF;


    // Normalize 0 - 1
    data.vibration =
        data.vibrationVoltage /
        ADC_VREF;


    // =================================================
    // UV
    // =================================================

    data.uvADC =
        analogRead(
            UV_PIN
        );


    data.uvVoltage =
        (
            data.uvADC /
            ADC_MAX
        )
        *
        ADC_VREF;


    // -------------------------------------------------
    // UV Index
    // -------------------------------------------------
    //
    // ยังไม่ได้ใส่สมการจริงของ UV sensor
    //

    data.uvIndex =
        0.0;


    // =================================================
    // TIMESTAMP
    // =================================================

    data.analogTimestamp =
        timestamp;
}


// =====================================================
// SENSOR FUSION
// =====================================================

void updateFusion(
    unsigned long now
)
{
    bool shtValid =
        data.shtValid &&
        (
            now -
            data.shtTimestamp
            <=
            SHT45_TIMEOUT
        );


    bool scdValid =
        data.scdValid &&
        (
            now -
            data.scdTimestamp
            <=
            SCD41_TIMEOUT
        );


    // =================================================
    // BOTH SENSOR
    // =================================================

    if (
        shtValid &&
        scdValid
    )
    {
        fusedTemperature =
            (
                data.shtTemperature *
                SHT_WEIGHT
            )
            +
            (
                data.scdTemperature *
                SCD_WEIGHT
            );


        fusedHumidity =
            (
                data.shtHumidity *
                SHT_WEIGHT
            )
            +
            (
                data.scdHumidity *
                SCD_WEIGHT
            );


        fusedValid =
            true;
    }


    // =================================================
    // SHT45 ONLY
    // =================================================

    else if (shtValid)
    {
        fusedTemperature =
            data.shtTemperature;


        fusedHumidity =
            data.shtHumidity;


        fusedValid =
            true;
    }


    // =================================================
    // SCD41 ONLY
    // =================================================

    else if (scdValid)
    {
        fusedTemperature =
            data.scdTemperature;


        fusedHumidity =
            data.scdHumidity;


        fusedValid =
            true;
    }


    // =================================================
    // NO SENSOR
    // =================================================

    else
    {
        fusedValid =
            false;
    }
}


// =====================================================
// MQTT PUBLISH
// =====================================================

void publishMQTT(
    unsigned long now
)
{
    if (
        !mqttClient.connected()
    )
    {
        return;
    }


    // =================================================
    // JSON DOCUMENT
    // =================================================

    JsonDocument doc;


    // =================================================
    // DEVICE ID
    // =================================================

    doc["deviceId"] =
        DEVICE_ID;


    // =================================================
    // FUSED TEMPERATURE
    // =================================================

    if (fusedValid)
    {
        doc["temperature"] =
            fusedTemperature;


        doc["humidity"] =
            fusedHumidity;
    }
    else
    {
        doc["temperature"] =
            nullptr;


        doc["humidity"] =
            nullptr;
    }


    // =================================================
    // VIBRATION
    // =================================================

    doc["vibration"] =
        data.vibration;


    // =================================================
    // LIGHT
    // =================================================

    doc["light"] =
        data.lightLux;


    // =================================================
    // UV
    // =================================================

    doc["uv"] =
        data.uvIndex;


    // =================================================
    // CO2
    // =================================================

    if (
        data.scdValid &&
        (
            now -
            data.scdTimestamp
            <=
            SCD41_TIMEOUT
        )
    )
    {
        doc["co2"] =
            data.co2;
    }
    else
    {
        doc["co2"] =
            nullptr;
    }


    // =================================================
    // SERIALIZE JSON
    // =================================================

    char buffer[512];


    size_t length =
        serializeJson(
            doc,
            buffer,
            sizeof(buffer)
        );


    // =================================================
    // MQTT PUBLISH
    // =================================================

    bool success =
        mqttClient.publish(
            MQTT_TOPIC,
            (const uint8_t*)buffer,
            length
        );


    if (success)
    {
        Serial.println();

        Serial.println(
            "========== MQTT =========="
        );


        Serial.print(
            "Topic: "
        );

        Serial.println(
            MQTT_TOPIC
        );


        Serial.print(
            "Payload: "
        );

        Serial.println(
            buffer
        );


        Serial.println(
            "=========================="
        );
    }
    else
    {
        Serial.println(
            "MQTT Publish FAILED"
        );
    }
}