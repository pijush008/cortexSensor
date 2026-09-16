/**
 * Publish one sample telemetry payload to the configured MQTT broker.
 *
 * A commissioning aid: it answers "is the whole ingest path alive?" without a
 * device on site. The payload is the same `BeamDeviceDataInput` contract the
 * firmware sends and `POST /api/beamDeviceData` accepts, so a reading that
 * arrives this way proves the identical path real hardware will take.
 *
 *   npx ts-node --transpile-only scripts/publish-sample-telemetry.ts <gatewayDeviceId> [deviceId] [type]
 *
 * `type` is SensorData (default) or NodeData. They feed DIFFERENT screens, and
 * sending only one is the usual reason half the console looks empty:
 *   SensorData -> a project's channel charts (/projects/<id>/dashboard)
 *   NodeData   -> the "Gateway nodes" panel on the operations dashboard
 *
 * Reads MQTT_BROKER_URL / MQTT_USERNAME / MQTT_PASSWORD from the environment,
 * exactly as the ingest service does, so a payload that publishes here is proof
 * the credentials the backend uses are correct.
 */
import mqtt from "mqtt";
import { config } from "../src/config";

const gatewayDeviceId = process.argv[2];
const deviceId = process.argv[3] ?? gatewayDeviceId;
const type = (process.argv[4] ?? "SensorData") as "SensorData" | "NodeData";

if (type !== "SensorData" && type !== "NodeData") {
  console.error(`Unknown type "${type}" — expected SensorData or NodeData.`);
  process.exit(1);
}

if (!gatewayDeviceId) {
  console.error(
    "Usage: publish-sample-telemetry.ts <gatewayDeviceId> [deviceId]\n" +
      "  gatewayDeviceId must match devices.gatewayDeviceId, or the reading is dropped.",
  );
  process.exit(1);
}

const topic = (config.mqtt.ingestTopics[0] ?? "shm/ingest/#").replace(
  /[#+]$/,
  gatewayDeviceId,
);

const telemetry: Record<string, unknown> = {
  GatewayDeviceId: gatewayDeviceId,
  DeviceId: deviceId,
  // Seconds, not milliseconds — the service multiplies by 1000.
  Timestamp: Math.floor(Date.now() / 1000),
  Battery: Number((70 + Math.random() * 30).toFixed(1)),
  Temperature: Number((25 + Math.random() * 10).toFixed(1)),
  Humidity: Number((50 + Math.random() * 30).toFixed(1)),
};

// Only SensorData carries channel readings; NodeData is the gateway reporting
// its own health, which is what the operations dashboard's node panel reads.
if (type === "SensorData") {
  telemetry.Sensor = {
    SensorType: "strain",
    Channels: [
      { SequenceNumber: 1, RawReading: Number((Math.random() * 100).toFixed(3)) },
      { SequenceNumber: 2, RawReading: Number((Math.random() * 100).toFixed(3)) },
    ],
  };
}

const payload = { Type: type, Telemetries: [telemetry] };

console.log(`broker : ${config.mqtt.brokerUrl}`);
console.log(`topic  : ${topic}`);

const client = mqtt.connect(config.mqtt.brokerUrl, {
  username: config.mqtt.username,
  password: config.mqtt.password,
  clientId: `shm-sample-publisher-${Date.now()}`,
  protocolVersion: 5,
  // One attempt: this is a diagnostic, and a silent retry loop would hide the
  // very failure it is being run to observe.
  reconnectPeriod: 0,
  connectTimeout: 10_000,
});

client.on("connect", () => {
  console.log("connected");
  client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) {
      console.error("publish failed:", err.message);
      process.exit(1);
    }
    console.log(`published ${type}:`, JSON.stringify(payload.Telemetries[0]));
    client.end(false, {}, () => process.exit(0));
  });
});

client.on("error", (err) => {
  console.error("connect failed:", err.message);
  process.exit(1);
});
