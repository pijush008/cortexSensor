import mqtt from "mqtt";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import * as iotService from "./iot.service";
import { beamDeviceDataSchema } from "./iot.types";

/**
 * Live device-to-cloud ingestion over MQTT.
 *
 * Real field hardware (ESP32 nodes, Raspberry Pi gateways) can publish the
 * same `BeamDeviceDataInput` JSON contract used by `POST /api/beamDeviceData`
 * onto the broker. This service subscribes to the configured topics and pushes
 * every valid message through the exact same pipeline (device → project lookup,
 * thresholds, sensor_data / node_data storage, alert emails), so REST and MQTT
 * paths behave identically.
 *
 * Env:
 *   MQTT_BROKER_URL     = mqtt://broker:1883 or ws://broker:9001
 *   MQTT_INGEST_ENABLED = "true" | "false"  (default true when broker set)
 *   MQTT_INGEST_TOPICS  = comma separated, e.g. shm/device/#
 */

let client: ReturnType<typeof mqtt.connect> | null = null;
let started = false;
let stopped = false;
let reconnectDelayMs = 5000;

async function handleMessage(topic: string, buffer: Buffer): Promise<void> {
  try {
    const raw = buffer.toString("utf8");
    if (!raw.trim()) return;

    const parsed = JSON.parse(raw) as unknown;
    const result = beamDeviceDataSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn(
        `MQTT ingest: dropping invalid payload on "${topic}": ${result.error.errors[0].message}`,
      );
      return;
    }

    const response = await iotService.createNetworkDataFromDevice(result.data);
    logger.info(`MQTT ingest "${topic}": ${response.message}`);
  } catch (err) {
    logger.error(`MQTT ingest handler failed on "${topic}"`, err as Error);
  }
}

export function startMqttIngest(): void {
  if (started) return;
  started = true;

  const brokerUrl = config.mqtt.brokerUrl;
  if (!config.mqtt.ingestEnabled) {
    logger.warn(
      "MQTT ingest disabled (set MQTT_INGEST_ENABLED=true to enable)",
    );
    return;
  }
  if (!brokerUrl) {
    logger.warn(
      "MQTT ingest skipped: MQTT_BROKER_URL is empty. Set it to mqtt:// or ws:// broker URL.",
    );
    return;
  }

  const topics = config.mqtt.ingestTopics;

  const connect = (): void => {
    if (stopped) return;

    try {
      client = mqtt.connect(brokerUrl, {
        username: config.mqtt.username,
        password: config.mqtt.password,
        clientId: config.mqtt.ingestClientId,
        protocolVersion: 5,
        keepalive: 30,
        clean: true,
      });
    } catch (err) {
      logger.error(`MQTT ingest connect failed: ${(err as Error).message}`);
      setTimeout(connect, reconnectDelayMs);
      return;
    }

    client.on("connect", () => {
      reconnectDelayMs = 5000;
      logger.info(`MQTT ingest connected to ${brokerUrl}`);
      for (const topic of topics) {
        client!.subscribe(topic, (err: Error | null) => {
          if (err) {
            logger.error(`MQTT ingest subscribe "${topic}" failed: ${err.message}`);
          } else {
            logger.info(`MQTT ingest subscribed to "${topic}"`);
          }
        });
      }
    });

    client.on("message", (topic: string, buffer: Buffer) => {
      void handleMessage(topic, buffer);
    });

    client.on("error", (err: Error) => {
      logger.error(`MQTT ingest error: ${err.message}`);
    });

    client.on("close", () => {
      if (stopped) return;
      logger.warn(
        `MQTT ingest disconnected; reconnecting in ${reconnectDelayMs / 1000}s`,
      );
      setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 60000);
    });
  };

  connect();
}

export function stopMqttIngest(): void {
  stopped = true;
  if (client) {
    try {
      client.end();
    } catch {
      // ignore teardown errors
    }
  }
}