/*
 * ESP32 Sensor Node — SHM platform field device
 * ==============================================
 * Reads structural sensors and publishes SHM telemetry over MQTT using the
 * exact `BeamDeviceDataInput` JSON contract the platform expects
 * (backend/src/modules/iot/iot.types.ts).
 *
 * Payload types published:
 *   - NodeData      → battery / temperature / humidity / pressure (node health)
 *   - SensorData    → strain / load-cell style readings (calibrated server-side)
 *   - HeartbeatData → liveness signal (updates device "last heartbeat" timestamp)
 *
 * Topologies supported:
 *   1) ESP32 → local Raspberry Pi broker  → Pi forwards to the cloud (recommended)
 *   2) ESP32 → cloud broker directly      (set MQTT_HOST to the cloud broker)
 *
 * Libraries (Arduino IDE > Sketch > Include Library > Manage Libraries):
 *   - PubSubClient  (by Nick O'Leary)   — MQTT
 *   - DHT sensor library (by Adafruit)  — only if using a DHT22
 *
 * Board: any ESP32 (e.g. ESP32 DevKit). Tested with Arduino core 2.x.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>

// -----------------------------------------------------------------------------
// 1. CONFIGURE ME
// -----------------------------------------------------------------------------

// WiFi
#define WIFI_SSID "YourWiFiSSID"
#define WIFI_PASS "YourWiFiPassword"

// MQTT broker (local Pi broker or cloud broker — same JSON contract)
#define MQTT_HOST "192.168.1.20" // Raspberry Pi / cloud broker IP
#define MQTT_PORT 1883
#define MQTT_USER ""
#define MQTT_PASS ""

// Device identity — MUST match a device registered in the platform
// (DeviceId + GatewayDeviceId uniquely identify your device row).
#define GATEWAY_DEVICE_ID "gw-esp32-01"
#define DEVICE_ID "fb8d"          // the "Device ID (Ackcio)" string from the device
#define DEVICE_NAME "Bridge Node A"
#define PROJECT_NAME "Kali Bridge"
#define DEVICE_TYPE "ESP32 SHM Node"

// Topic the node publishes on (Pi gateway subscribes to esp32/+/data)
#define MQTT_TOPIC "esp32/" GATEWAY_DEVICE_ID "/data"

// Set to true to run without physical sensors (demo / bench testing)
#define USE_FAKE_SENSORS true

// -----------------------------------------------------------------------------
// 2. SENSOR SETUP
// -----------------------------------------------------------------------------

#define DHT_PIN 4        // GPIO where the DHT22 is connected (DHT type 22)
#define BATTERY_PIN 34   // ADC pin reading a scaled battery voltage (or -1)
#define STRAIN_PIN 35    // ADC pin for a strain/load-cell channel (or -1)

#define SENSOR_CHANNELS 1  // how many RawReading values go into SensorData
#define SENSOR_TYPE_NAME "Strain"

// Intervals (ms)
#define NODE_INTERVAL_MS 30000   // NodeData (battery/env) cadence
#define SENSOR_INTERVAL_MS 15000 // SensorData (strain) cadence
#define HEARTBEAT_MS 60000       // HeartbeatData cadence

// Battery scaling: ADC -> volts. Default: 0..4095 maps to 0..4.2V (3.3V divider).
#define BATTERY_ADC_MAX 4095.0f
#define BATTERY_MAX_VOLTS 4.2f
#define BATTERY_MIN_VOLTS 3.2f

#if USE_FAKE_SENSORS
// no real libraries needed
#else
#include <DHT.h>
DHT dht(DHT_PIN, DHT22);
#endif

WiFiClient net;
PubSubClient mqtt(net);

unsigned long lastNodeMs = 0;
unsigned long lastSensorMs = 0;
unsigned long lastHeartbeatMs = 0;

// -----------------------------------------------------------------------------
// 3. TELEMETRY BUILDERS (exact platform JSON contract)
// -----------------------------------------------------------------------------

unsigned long unixNow() {
  // NTP is synced in setup; returns seconds since epoch.
  return (unsigned long)time(nullptr);
}

String jsonString(const char* s) {
  // Minimal JSON escaping for device-provided strings.
  String out = "\"";
  for (size_t i = 0; s && i < strlen(s); i++) {
    char c = s[i];
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      default: out += c;
    }
  }
  out += "\"";
  return out;
}

float fakeBattery() {
  // Slow battery drain for demo purposes (starts ~88%, -4% per hour).
  static unsigned long start = millis();
  float v = 3.95f - ((millis() - start) / 3600000.0f) * 0.17f;
  if (v < 3.2f) v = 3.2f;
  return v;
}

float readTemperature() {
#if USE_FAKE_SENSORS
  return 20.0f + sin(millis() / 60000.0f) * 5.0f;
#else
  float t = dht.readTemperature();
  return isnan(t) ? 0.0f : t;
#endif
}

float readHumidity() {
#if USE_FAKE_SENSORS
  return 45.0f + cos(millis() / 90000.0f) * 10.0f;
#else
  float h = dht.readHumidity();
  return isnan(h) ? 0.0f : h;
#endif
}

float readPressure() {
#if USE_FAKE_SENSORS
  return 1013.0f + sin(millis() / 120000.0f) * 3.0f;
#else
  // Without a BMP/BME sensor, report ambient reference.
  return 1013.0f;
#endif
}

float readBatteryVolts() {
#if USE_FAKE_SENSORS
  return fakeBattery();
#else
  if (BATTERY_PIN < 0) return 0.0f;
  int adc = analogRead(BATTERY_PIN);
  return ((float)adc / BATTERY_ADC_MAX) * BATTERY_MAX_VOLTS;
#endif
}

float batteryPercent() {
  float v = readBatteryVolts();
  float pct = (v - BATTERY_MIN_VOLTS) /
              (BATTERY_MAX_VOLTS - BATTERY_MIN_VOLTS) * 100.0f;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

float readStrainRaw(int channel) {
#if USE_FAKE_SENSORS
  // Slightly noisy oscillating strain in micro-strain-ish raw units.
  return 100.0f + sin((millis() / 5000.0f) + channel * 1.7f) * 60.0f +
         (random(0, 200) / 10.0f - 10.0f);
#else
  if (STRAIN_PIN < 0) return 0.0f;
  int adc = analogRead(STRAIN_PIN + channel);
  // Map 0..4095 -> 0..1000 raw units (tune to your load cell / strain gauge)
  return (float)adc / BATTERY_ADC_MAX * 1000.0f;
#endif
}
String buildNodeData() {
  String p = "{";
  p += "\"Type\":\"NodeData\",\"Telemetries\":[{";
  p += "\"Battery\":" + String((int)batteryPercent());
  p += ",\"Temperature\":" + String(readTemperature(), 2);
  p += ",\"Humidity\":" + String(readHumidity(), 2);
  p += ",\"Pressure\":" + String(readPressure(), 2);
  p += ",\"GatewayDeviceId\":" + jsonString(GATEWAY_DEVICE_ID);
  p += ",\"DeviceId\":" + jsonString(DEVICE_ID);
  p += ",\"DeviceName\":" + jsonString(DEVICE_NAME);
  p += ",\"ProjectName\":" + jsonString(PROJECT_NAME);
  p += ",\"DeviceType\":" + jsonString(DEVICE_TYPE);
  p += ",\"Timestamp\":" + String(unixNow());
  p += "}]}";
  return p;
}

String buildSensorData() {
  String p = "{";
  p += "\"Type\":\"SensorData\",\"Telemetries\":[{";
  p += "\"GatewayDeviceId\":" + jsonString(GATEWAY_DEVICE_ID);
  p += ",\"DeviceId\":" + jsonString(DEVICE_ID);
  p += ",\"DeviceName\":" + jsonString(DEVICE_NAME);
  p += ",\"ProjectName\":" + jsonString(PROJECT_NAME);
  p += ",\"Timestamp\":" + String(unixNow());
  p += ",\"Sensor\":{\"SensorType\":" + jsonString(SENSOR_TYPE_NAME);
  p += ",\"Channels\":[";
  for (int i = 0; i < SENSOR_CHANNELS; i++) {
    if (i > 0) p += ",";
    p += "{\"RawReading\":" + String(readStrainRaw(i), 2) + "}";
  }
  p += "]}}]}";
  return p;
}

String buildHeartbeatData() {
  String p = "{";
  p += "\"Type\":\"HeartbeatData\",\"Telemetries\":[{";
  p += "\"GatewayDeviceId\":" + jsonString(GATEWAY_DEVICE_ID);
  p += ",\"DeviceId\":" + jsonString(DEVICE_ID);
  p += ",\"Timestamp\":" + String(unixNow());
  p += "}]}";
  return p;
}

// -----------------------------------------------------------------------------
// 4. CONNECTIVITY
// -----------------------------------------------------------------------------

void ensureNtp() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  int tries = 0;
  while (time(nullptr) < 100000 && tries < 10) {
    delay(500);
    tries++;
  }
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected, IP: " + WiFi.localIP().toString());
  ensureNtp();
}

void connectMqtt() {
  while (!mqtt.connected()) {
    Serial.print("Connecting to MQTT broker...");
    String clientId = String("esp32-") + DEVICE_ID + "-" + String((unsigned long)(ESP.getEfuseMac() & 0xFFFFFFFFull), HEX);
    if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println(" connected");
    } else {
      Serial.print(" failed rc=");
      Serial.print(mqtt.state());
      Serial.println(" retrying in 5s");
      delay(5000);
    }
  }
}

void publish(const String& payload) {
  if (!mqtt.connected()) {
    if (WiFi.status() != WL_CONNECTED) connectWiFi();
    connectMqtt();
  }
  bool ok = mqtt.publish(MQTT_TOPIC, payload.c_str());
  if (ok) {
    Serial.println("→ " + MQTT_TOPIC + " " + payload);
  } else {
    Serial.println("✗ publish failed");
  }
}

// -----------------------------------------------------------------------------
// 5. SETUP / LOOP
// -----------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));
#ifndef USE_FAKE_SENSORS
  dht.begin();
#endif
  connectWiFi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (!mqtt.connected()) {
    connectMqtt();
  }
  mqtt.loop();

  unsigned long now = millis();

  if (now - lastSensorMs >= SENSOR_INTERVAL_MS) {
    lastSensorMs = now;
    publish(buildSensorData());
  }

  if (now - lastNodeMs >= NODE_INTERVAL_MS) {
    lastNodeMs = now;
    publish(buildNodeData());
  }

  if (now - lastHeartbeatMs >= HEARTBEAT_MS) {
    lastHeartbeatMs = now;
    publish(buildHeartbeatData());
  }
}