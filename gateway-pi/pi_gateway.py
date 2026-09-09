#!/usr/bin/env python3
"""
SHM Raspberry Pi gateway — field edge bridge.

Collects telemetry from ESP32 sensor nodes on the LOCAL broker and forwards it
to the CLOUD (broker + backend REST fallback) so office users can view and
download the data.

Topology:

  ESP32 nodes ──(esp32/+/data, local)──▶  LOCAL broker  ─▶  py gateway
                                                              │
        cloud MQTT (shm/device/data) ─────────────────────────┤
        REST POST /api/beamDeviceData (x-api-key) ────────────┤
                                                              ▼
                                              Cloud backend → PostgreSQL

The payload is forwarded **verbatim** — ESP32s already publish the exact
`BeamDeviceDataInput` JSON contract the backend expects.

Config (environment variables, defaults shown):
  LOCAL_BROKER_HOST   localhost   LOCAL_BROKER_PORT   1883
  LOCAL_TOPIC         esp32/+/data
  CLOUD_BROKER_HOST   (required)  CLOUD_BROKER_PORT   1883
  CLOUD_USER          CLOUD_PASS                       (optional)
  CLOUD_TLS           true|false (default false)
  CLOUD_TOPIC         shm/device/data
  BACKEND_URL         (optional) e.g. https://cloud.example.com/api/beamDeviceData
  IOT_API_KEY         (required when BACKEND_URL is set)

Run:
  pip install -r requirements.txt
  CLOUD_BROKER_HOST=mqtt.cloud.example.com python3 pi_gateway.py
"""

import logging
import os
import signal
import sys
import time

import paho.mqtt.client as mqtt

try:
    import requests
except ImportError:  # requests is optional — only needed for REST fallback
    requests = None


# ---------------------------------------------------------------- config
class Config:
    LOCAL_BROKER_HOST = os.getenv("LOCAL_BROKER_HOST", "localhost")
    LOCAL_BROKER_PORT = int(os.getenv("LOCAL_BROKER_PORT", "1883"))
    LOCAL_TOPIC = os.getenv("LOCAL_TOPIC", "esp32/+/data")

    CLOUD_BROKER_HOST = os.getenv("CLOUD_BROKER_HOST", "")
    CLOUD_BROKER_PORT = int(os.getenv("CLOUD_BROKER_PORT", "1883"))
    CLOUD_USER = os.getenv("CLOUD_USER", "")
    CLOUD_PASS = os.getenv("CLOUD_PASS", "")
    CLOUD_TLS = os.getenv("CLOUD_TLS", "false").lower() == "true"
    # Per-tenant ingest namespace: the mosquitto ACL confines each broker user
    # (pattern write shm/ingest/%u/#) to shm/ingest/<username>/#. Default the
    # publish topic to match, so the gateway can't cross tenants by mistyping.
    CLOUD_TOPIC = os.getenv(
        "CLOUD_TOPIC",
        f"shm/ingest/{os.getenv('CLOUD_USER', 'gateway')}/data",
    )

    BACKEND_URL = os.getenv("BACKEND_URL", "")
    IOT_API_KEY = os.getenv("IOT_API_KEY", "")

    LOG_FILE = os.getenv("GATEWAY_LOG_FILE", "/var/log/shm_gateway.log")


cfg = Config()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(cfg.LOG_FILE, delay=True),
    ],
)
log = logging.getLogger("shm-gateway")

cloud_client = mqtt.Client(client_id="pi-gateway-cloud", protocol=mqtt.MQTTv311)
session = requests.Session() if requests else None

forwarded = 0
dropped = 0
last_report = time.monotonic()


# ---------------------------------------------------------------- cloud MQTT
def on_cloud_connect(client, _userdata, _flags, rc):
    log.info("Cloud broker connection: rc=%s", rc)
    if rc != 0:
        log.warning("Cloud MQTT refused credentials; will retry.")


def connect_cloud():
    if not cfg.CLOUD_BROKER_HOST:
        log.warning("CLOUD_BROKER_HOST not set — cloud MQTT forwarding disabled.")
        return False
    cloud_client.username_pw_set(cfg.CLOUD_USER, cfg.CLOUD_PASS)
    if cfg.CLOUD_TLS:
        cloud_client.tls_set()
        cloud_client.tls_insecure_set(False)
    cloud_client.on_connect = on_cloud_connect
    try:
        cloud_client.connect_async(cfg.CLOUD_BROKER_HOST, cfg.CLOUD_BROKER_PORT)
        cloud_client.loop_start()
        log.info(
            "Cloud MQTT → %s:%s topic=%s",
            cfg.CLOUD_BROKER_HOST,
            cfg.CLOUD_BROKER_PORT,
            cfg.CLOUD_TOPIC,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        log.error("Cloud MQTT connect error: %s", exc)
        return False


def forward_to_cloud(payload: bytes) -> None:
    """Publish to the cloud broker (best effort) and optionally REST-forward."""
    global forwarded  # noqa: PLW0603
    if cfg.CLOUD_BROKER_HOST and cloud_client.is_connected():
        cloud_client.publish(cfg.CLOUD_TOPIC, payload, qos=1)

    if cfg.BACKEND_URL and session:
        try:
            resp = session.post(
                cfg.BACKEND_URL,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": cfg.IOT_API_KEY,
                },
                timeout=8,
            )
            if not (200 <= resp.status_code < 300):
                log.warning("REST forward status %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:  # noqa: BLE001
            log.warning("REST forward failed: %s", exc)
# ---------------------------------------------------------------- local SUB
def on_local_connect(client, _userdata, _flags, rc):
    log.info("Local broker connected rc=%s", rc)
    client.subscribe(cfg.LOCAL_TOPIC, qos=1)
    log.info("Subscribed to %s", cfg.LOCAL_TOPIC)


def on_local_message(_client, _userdata, msg):
    global forwarded, dropped, last_report  # noqa: PLW0603
    try:
        forward_to_cloud(msg.payload)
        forwarded += 1
    except Exception as exc:  # noqa: BLE001
        dropped += 1
        log.exception("Failed to forward: %s", exc)

    if time.monotonic() - last_report >= 30:
        log.info("forwarded=%d dropped=%d", forwarded, dropped)
        last_report = time.monotonic()


def connect_local():
    local_client = mqtt.Client(client_id="pi-gateway-local", protocol=mqtt.MQTTv311)
    local_client.on_connect = on_local_connect
    local_client.on_message = on_local_message
    local_client.reconnect_delay_set(min_delay=2, max_delay=30)
    try:
        local_client.connect(cfg.LOCAL_BROKER_HOST, cfg.LOCAL_BROKER_PORT)
    except Exception as exc:  # noqa: BLE001
        log.error("Local broker unreachable: %s", exc)
        raise
    local_client.loop_forever(retry_first_connection=True)


# ---------------------------------------------------------------- main
def main():
    if not cfg.CLOUD_BROKER_HOST and not cfg.BACKEND_URL:
        log.error("Nothing to forward to. Set CLOUD_BROKER_HOST and/or BACKEND_URL.")
        sys.exit(1)

    log.info("SHM Pi gateway starting")
    log.info(
        "Listening %s:%s topic=%s",
        cfg.LOCAL_BROKER_HOST,
        cfg.LOCAL_BROKER_PORT,
        cfg.LOCAL_TOPIC,
    )
    connect_cloud()

    def _stop(_sig, _frame):
        log.info("Shutting down")
        cloud_client.loop_stop()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    while True:
        try:
            connect_local()
        except KeyboardInterrupt:
            break
        except Exception as exc:  # noqa: BLE001
            log.error("Local connection lost: %s — retrying in 10s", exc)
            time.sleep(10)


if __name__ == "__main__":
    main()