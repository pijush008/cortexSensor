# ESP32 Sensor Node — SHM field firmware

An ESP32 reading structural sensors (strain gauges / load cells, DHT22,
battery) and publishing SHM telemetry over MQTT.

The payloads use the **exact `BeamDeviceDataInput` JSON contract** consumed by:

- `POST /api/beamDeviceData` (REST, `x-api-key`)
- The backend MQTT ingest (`MQTT_INGEST_TOPICS`, default `shm/device/#`)

so one firmware works for both field topologies below.

```
┌────────────┐   MQTT (esp32/gw-esp32-01/data)   ┌────────────────────┐
│  ESP32     │ ─────────────────────────────────▶ │  Raspberry Pi      │
│  sensor    │   (or straight to the cloud        │  gateway           │
│  node      │    broker — it's the same JSON)    │  (gateway-pi/)     │
└────────────┘                                    └─────────┬──────────┘
                                                            │ cloud MQTT
                                                            ▼
                                            ┌────────────────────────────┐
                                            │  Cloud: broker → backend   │
                                            │  (REST fallback x-api-key)  │
                                            └────────────────────────────┘
```

## What it publishes

| Type | Cadence (default) | Fields |
|---|---|---|
| `SensorData` | every 15 s | `Sensor.SensorType`, `Sensor.Channels[i].RawReading` |
| `NodeData` | every 30 s | battery %, temp, humidity, pressure |
| `HeartbeatData` | every 60 s | gateway + device id, unix timestamp |

Readings are **raw**; the backend applies `calibrationValue × rawReading` and
stores the calibrated value in `sensor_data` — exactly like the real Ackcio
beam nodes.

## Wiring (example)

| ESP32 pin | Component |
|---|---|
| GPIO 4  | DHT22 (data) |
| GPIO 34 | Battery voltage divider (ADC) |
| GPIO 35 | Strain gauge / load-cell channel 1 (ADC) |
| …       | Add more strain channels on consecutive ADC pins |

Set `USE_FAKE_SENSORS true` to bench-test over WiFi without any sensors.

## Flashing

1. Install **Arduino IDE** (2.x) and the **ESP32 core**:
   `File ▸ Preferences ▸ Additional boards manager URLs`:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   then `Boards Manager ▸ install "esp32 by Espressif Systems"`.
2. `Sketch ▸ Include Library ▸ Manage Libraries` → install
   **PubSubClient** and **DHT sensor library by Adafruit**.
3. Edit the `CONFIGURE ME` block at the top of
   `esp32_sensor_node.ino`:
   - `WIFI_SSID` / `WIFI_PASS`
   - `MQTT_HOST` — the Raspberry Pi broker IP (or cloud broker)
   - `GATEWAY_DEVICE_ID`, `DEVICE_ID`, `DEVICE_NAME`, `PROJECT_NAME`
4. Select the board (e.g. **ESP32 Dev Module**) and **Upload**.

> The `DEVICE_ID`/`GATEWAY_DEVICE_ID` pair must match a **device registered in
> the platform** (Devices page), assigned to a running project, otherwise the
> backend ignores the payload.

## Verifying

```bash
# 1) Subscribe on the Pi / dev machine
mosquitto_sub -h <broker> -t 'esp32/#' -v

# 2) You should see e.g.
topic: esp32/gw-esp32-01/data
{
  "Type": "SensorData",
  "Telemetries": [{
    "GatewayDeviceId": "gw-esp32-01",
    "DeviceId": "fb8d",
    ...
```

Once the Raspberry Pi gateway is forwarding to the cloud, readings land in the
`node_data` / `sensor_data` tables and are visible in the office dashboard,
analytics and Data-Download pages.