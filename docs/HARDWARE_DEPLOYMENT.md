# Hardware Deployment — ESP32 → Raspberry Pi → Cloud → Office

This guide wires the **physical field hardware** into the SHM platform so live
data can be viewed and downloaded from the office.

## 1. Architecture

```
 FIELD (structure being monitored)
 ┌──────────────────────────────────────────────────────────────────────┐
 │  ESP32 sensor nodes (strain gauges, load cells, DHT22, battery)      │
 │      │  MQTT publish: esp32/<gatewayDeviceId>/data                   │
 │      ▼                                                               │
 │  Local MQTT broker (mosquitto on the Raspberry Pi)                   │
 │      │                                                               │
 │  Raspberry Pi gateway  (gateway-pi/pi_gateway.py)                    │
 └──────┼───────────────────────────────────────────────────────────────┘
        │  cloud MQTT publish: shm/device/data            (or TLS)
        │  REST fallback: POST https://<cloud>/api/beamDeviceData
        ▼
 CLOUD
 ┌──────────────────────────────────────────────────────────────────────┐
 │  MQTT broker (mosquitto/cloud)                                       │
 │      │   subscribe: shm/device/#                                    │
 │      ▼                                                               │
 │  Backend  (Express + Prisma)  ── MQTT ingest ──►  PostgreSQL          │
 │        │                                                             │
 │        └── POST /api/beamDeviceData (x-api-key REST path)            │
 └──────────────────────────────────────────────────────────────────────┘
        ▲
 OFFICE
 │  Web dashboard at <cloud>/   — live view (Dashboard / Analytics / MQTT)
 │  Data-Download page          — live MQTT capture + historical CSV export
```

### Two ingestion paths (identical JSON contract)

Both paths store into the same tables, so the office UI is agnostic:

| Path | When |
|---|---|
| **MQTT ingest** | Pi publishes `shm/device/data`; backend subscribes (`MQTT_INGEST_TOPICS`, default `shm/device/#`). Zero HTTP per message. |
| **REST ingest** | Pi (or any HTTP-capable node) `POST`s `/api/beamDeviceData` with header `x-api-key`. Useful as fallback behind firewalls. |

## 2. Equipment

| Qty | Item | Role |
|---|---|---|
| n | ESP32 (DevKit / TTGO) | sensor node — reads strain/load cells, battery, env |
| 1 | Raspberry Pi 3B+/4 | local broker + edge gateway (can also be the MQTT broker in the field) |
| n | Strain gauges / load cells / LVDTs | structural channels (Wheatstone / potentiometer style) |
| 1 | DHT22 (optional) | node temperature + humidity |
| 1 | 12 V → 5 V solar/battery kit (optional) | field power |
| – | ESP32 power (USB battery / 18650 + divider) | node power |

Firmware: `firmware/esp32_sensor_node/` (see its README for wiring + flashing).

## 3. Cloud side (one-time setup)

Start the cloud stack (or deploy the same containers to a VPS):

```bash
cd SHM
docker compose up --build -d
```

Backend env additions (already in `docker-compose.yml`):

```yaml
MQTT_BROKER_URL: "mqtt://mosquitto:1883"   # cloud broker address
MQTT_INGEST_ENABLED: "true"
MQTT_INGEST_TOPICS: "shm/device/#"
IOT_API_KEY: "<openssl rand -hex 24>"       # shared secret for REST path
```

> For production set a strong `IOT_API_KEY`, use TLS between the Pi and the
> cloud broker (`CLOUD_TLS=true`), and put the backend behind HTTPS.

## 4. Register the field device in the platform

1. **Devices** page → Add Device.
   - `deviceName` = e.g. "Bridge Node A"
   - `deviceId` = the **Device ID** string the ESP32 uses (e.g. `fb8d`)
   - `gatewayDeviceId` = e.g. `gw-esp32-01`
   - Assign an admin, set status **active**.
2. **Sensors** page → create the sensors the node reports (e.g. a *Strain*
   sensor with type matching `SensorType` sent by the node).
3. **Projects** page → create a project, assign the device + sensors as its
   channels (channel `assignSensor` mapping), set start/end dates.
4. Platform only accepts data while the project is **within its start/end
## 5. Field side setup

### 5a. Flash ESP32 nodes
See `firmware/esp32_sensor_node/README.md`. Set the config block:

```c
#define WIFI_SSID "..."
#define WIFI_PASS "..."
#define MQTT_HOST "192.168.1.20"   // Raspberry Pi IP (or cloud broker IP)
#define GATEWAY_DEVICE_ID "gw-esp32-01"
#define DEVICE_ID "fb8d"
#define DEVICE_NAME "Bridge Node A"
#define PROJECT_NAME "Kali Bridge"
#define USE_FAKE_SENSORS false
```

### 5b. Local broker on the Pi

```bash
sudo apt update && sudo apt install -y mosquitto
sudo systemctl enable --now mosquitto
```

### 5c. Gateway on the Pi

```bash
cd gateway-pi
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cat > .env <<'EOF'
CLOUD_BROKER_HOST=mqtt.cloud.example.com
CLOUD_BROKER_PORT=8883
CLOUD_USER=shm
CLOUD_PASS=change-me
CLOUD_TLS=true
BACKEND_URL=https://cloud.example.com/api/beamDeviceData
IOT_API_KEY=change-me-to-random-value
EOF

sudo cp pi_gateway.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now shm-gateway
journalctl -u shm-gateway -f
```

## 6. Verify end-to-end

```bash
# on the cloud box / office machine, watch live ingest:
docker compose logs -f backend | grep -i mqtt

# raw MQTT (cloud)
mosquitto_sub -h mqtt.cloud.example.com -t 'shm/device/#' -v

# DB
docker compose exec postgres psql -U shm -d shm_dev -c \
  "select id,device_id,project_id,sensor_id,sensor_data,created_at
     from sensor_data order by id desc limit 5;"
```

## 7. Office view & download

| Where | What |
|---|---|
| Dashboard / Analytics | live structural graphs, fleet health |
| MQTT Feed | raw live topic stream |
| **Data Download** | **live capture** (browser MQTT + Excel) OR **historical CSV export** (sensor / node data with device + date range) |

New office-facing endpoints added for this flow:

| Endpoint | Description |
|---|---|
| `POST /api/download/sensorData` | CSV of calibrated sensor readings (`projectId`, `deviceId`, `sensorId`, `startDate`, `endDate`); cap `TELEMETRY_EXPORT_ROW_LIMIT` (default 100 000) |
| `POST /api/download/nodeData` | CSV of node/gateway health (battery, temp, humidity, pressure) |

Both require a logged-in user with `PROJECT_REPORTS`
(superadmin / admin / contractor / authority).

## 8. Offline field resilience

- **Local broker first**: nodes → Pi broker even when the internet drops; the
  Pi keeps trying to reach cloud with backoff (`reconnect_delay_set`).
- **Throttle**: default node cadence is 15–30 s; tune
  `SENSOR_INTERVAL_MS` / `NODE_INTERVAL_MS` in the firmware for your
  bandwidth budget.
- For guaranteed delivery (edge buffering), enable MQTT QoS 1 on the local
  hop and persistent sessions, or point the Pi at the cloud REST fallback
  which is retried by the gateway.
   window** and `isRegistered=true`.