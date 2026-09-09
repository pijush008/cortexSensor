/**
 * SHM sample gateway — simulates the field hardware path:
 *
 *   ESP32 sensor node  ──(MQTT publish)──▶  broker  ──(backend ingest)──▶  DB
 *   Raspberry Pi       ──(REST forward, x-api-key)──▶  POST /api/beamDeviceData
 *
 * The MQTT payload uses the exact BeamDeviceDataInput contract expected by
 * `createNetworkDataFromDevice` (see backend/src/modules/iot/iot.types.ts).
 */
const mqtt = require("mqtt");
const axios = require("axios");

const broker = process.env.MQTT_BROKER || "mqtt://mosquitto:1883";
const backendUrl =
  process.env.BACKEND_URL || "http://backend:3001/api/beamDeviceData";
const apiKey = process.env.IOT_API_KEY || "dev-iot-key";
const mqttUser = process.env.MQTT_USERNAME || "";
const mqttPass = process.env.MQTT_PASSWORD || "";

const GATEWAY_DEVICE_ID = process.env.GATEWAY_DEVICE_ID || "gw-sample-1";
const DEVICE_ID = process.env.DEVICE_ID || "fb8d";
const DEVICE_NAME = process.env.DEVICE_NAME || "Sample Bridge Node";
const PROJECT_NAME = process.env.PROJECT_NAME || "Demo Project";
const TOPIC = process.env.TOPIC || "shm/ingest/shm-gateway/data";

const client = mqtt.connect(broker, {
  username: mqttUser,
  password: mqttPass,
  clientId: `gw-${GATEWAY_DEVICE_ID}`,
  protocolVersion: 5,
});

function now() {
  return Math.floor(Date.now() / 1000);
}

function round(v, dp = 2) {
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

function nodeTelemetry() {
  return {
    Type: "NodeData",
    Telemetries: [
      {
        Battery: 80 + Math.round(Math.random() * 15),
        Temperature: round(20 + Math.random() * 10),
        Humidity: round(40 + Math.random() * 20),
        Pressure: 1013 + Math.round(Math.random() * 10),
        GatewayDeviceId: GATEWAY_DEVICE_ID,
        DeviceId: DEVICE_ID,
        DeviceName: DEVICE_NAME,
        ProjectName: PROJECT_NAME,
        DeviceType: "Ackcio Beam",
        Timestamp: now(),
      },
    ],
  };
}

function sensorTelemetry() {
  return {
    Type: "SensorData",
    Telemetries: [
      {
        GatewayDeviceId: GATEWAY_DEVICE_ID,
        DeviceId: DEVICE_ID,
        DeviceName: DEVICE_NAME,
        ProjectName: PROJECT_NAME,
        Timestamp: now(),
        Sensor: {
          SensorType: "Strain",
          Channels: [{ RawReading: round(100 + Math.sin(Date.now() / 5000) * 60 + Math.random() * 20) }],
        },
      },
    ],
  };
}

function heartbeatTelemetry() {
  return {
    Type: "HeartbeatData",
    Telemetries: [
      {
        GatewayDeviceId: GATEWAY_DEVICE_ID,
        DeviceId: DEVICE_ID,
        Timestamp: now(),
      },
    ],
  };
}

client.on("connect", () => {
  console.log("Gateway connected to broker", broker);

  // node health every 30s
  setInterval(() => {
    const payload = nodeTelemetry();
    client.publish(TOPIC, JSON.stringify(payload), {}, () => {
      console.log("Published NodeData →", TOPIC);
    });
    forwardRest(payload);
  }, 30000);

  // sensor readings every 10s
  setInterval(() => {
    const payload = sensorTelemetry();
    client.publish(TOPIC, JSON.stringify(payload), {}, () => {
      console.log("Published SensorData →", TOPIC);
    });
    forwardRest(payload);
  }, 10000);

  // heartbeat every 60s
  setInterval(() => {
    client.publish(TOPIC, JSON.stringify(heartbeatTelemetry()), {}, () => {
      console.log("Published HeartbeatData →", TOPIC);
    });
  }, 60000);

  // immediate first sample so the pipeline shows data right away
  const first = sensorTelemetry();
  client.publish(TOPIC, JSON.stringify(first), {}, () => {
    console.log("Published initial SensorData →", TOPIC);
  });
  forwardRest(first);
});

function forwardRest(payload) {
  axios
    .post(backendUrl, payload, {
      headers: { "x-api-key": apiKey },
      timeout: 5000,
    })
    .then((res) => {
      console.log("Forwarded to backend", res.status, res.data && res.data.message);
    })
    .catch((err) => {
      console.error("Backend post failed", err.message);
    });
}

client.on("message", (topic, message) => {
  console.log("Received", topic, message.toString());
});

client.on("error", (err) => {
  console.error("MQTT error", err.message);
});

