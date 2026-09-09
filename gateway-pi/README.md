# Raspberry Pi gateway — field → cloud bridge

Bridges the **local** MQTT topic namespace used by ESP32 sensor nodes to the
**cloud** so office users can view and download the data.

```
ESP32 nodes ──(esp32/+/data)──▶ local broker ──▶ pi_gateway.py
                                                   │  cloud MQTT  shm/device/data
                                                   │  REST fallback /api/beamDeviceData
                                                   ▼
                                     cloud backend → PostgreSQL → office dashboard
```

The payload is forwarded **verbatim** — the ESP32 firmware already publishes
the `BeamDeviceDataInput` JSON that the backend validates.

## Install (Raspberry Pi OS, Python 3.9+)

```bash
sudo apt update && sudo apt install -y python3-venv mosquitto
cd ~/shm/gateway-pi
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# optionally keep credentials in a .env file (used by the systemd unit)
cat > .env <<'EOF'
CLOUD_BROKER_HOST=mqtt.cloud.example.com
CLOUD_BROKER_PORT=1883
CLOUD_USER=shm
CLOUD_PASS=change-me
CLOUD_TLS=true
BACKEND_URL=https://cloud.example.com/api/beamDeviceData
IOT_API_KEY=change-me-to-random-value
EOF
```

## Run

```bash
# foreground (defaults: localhost:1883, topic esp32/+/data)
CLOUD_BROKER_HOST=mqtt.cloud.example.com .venv/bin/python pi_gateway.py
```

## Autostart on boot (systemd)

```bash
sudo cp pi_gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now shm-gateway
journalctl -u shm-gateway -f
```

## Config reference

| Variable | Default | Purpose |
|---|---|---|
| `LOCAL_BROKER_HOST` / `LOCAL_BROKER_PORT` | `localhost:1883` | broker the ESP32 nodes publish to |
| `LOCAL_TOPIC` | `esp32/+/data` | what this gateway subscribes to |
| `CLOUD_BROKER_HOST` / `CLOUD_BROKER_PORT` | *(required)* | cloud MQTT broker |
| `CLOUD_USER` / `CLOUD_PASS` | empty | cloud broker credentials |
| `CLOUD_TLS` | `false` | set `true` for `mqtts`/TLS brokers |
| `CLOUD_TOPIC` | `shm/device/data` | where cloud republishes (backend ingests `shm/device/#`) |
| `BACKEND_URL` | empty | optional REST fallback to `POST /api/beamDeviceData` |
| `IOT_API_KEY` | empty | `x-api-key` header for the REST fallback |
| `GATEWAY_LOG_FILE` | `/var/log/shm_gateway.log` | log file |

## Test without ESP32 hardware

```bash
mosquitto_pub -t esp32/gw-test/data -m '{"Type":"NodeData","Telemetries":[{"Battery":95,"Temperature":23.4,"Humidity":41,"Pressure":1013,"GatewayDeviceId":"gw-test","DeviceId":"fb8d","DeviceName":"Test Node","ProjectName":"Demo Project","DeviceType":"Ackcio Beam","Timestamp":1700000000}]}'
```

Then watch `journalctl -u shm-gateway -f` and confirm the reading appears in
the office dashboard / Data-Download page.