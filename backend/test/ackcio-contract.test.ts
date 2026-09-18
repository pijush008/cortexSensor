import { describe, expect, test } from "vitest";
import {
  ackcioEnvelopeSchema,
  heartbeatTelemetrySchema,
  networkTelemetrySchema,
  nodeTelemetrySchema,
  sensorTelemetrySchema,
} from "../src/modules/ackcio/ackcio.types";
import { catalogEntryFor, humaniseAckcioType, sensorNameFor } from "../src/modules/ackcio/sensor-catalog";
import { readingEventId } from "../src/modules/ackcio/ackcio.service";
import * as samples from "./fixtures/ackcio-payloads";

/**
 * The Ackcio Beam Gateway API Specification v1.18, sample by sample.
 *
 * No database: these pin the parser to the exact JSON the document shows, so
 * a schema tightened in good faith cannot quietly start answering a real
 * gateway with 400 — which, per §7, it would then retry for ever.
 */

function telemetryOf(envelope: unknown) {
  const parsed = ackcioEnvelopeSchema.parse(envelope);
  return parsed.Telemetries;
}

describe("every sample payload in the specification parses", () => {
  test("§2 SensorData, vibrating wire", () => {
    const [t] = telemetryOf(samples.sensorDataVW);
    const parsed = sensorTelemetrySchema.parse(t);
    expect(parsed.DeviceId).toBe("ecde");
    expect(parsed.Sensor.SensorId).toBe(0);
    expect(parsed.Sensor.Channels).toHaveLength(3);
    expect(parsed.Sensor.Channels[0].Reading).toBe(20.98);
    expect(parsed.Sensor.Channels[0].RawReading).toBe(875.8);
    expect(parsed.Sensor.Channels[0].UnitType).toBe("µε");
  });

  test("§3 NodeData", () => {
    const [t] = telemetryOf(samples.nodeData);
    const parsed = nodeTelemetrySchema.parse(t);
    expect(parsed.Battery).toBe(3888);
    expect(parsed.Pressure).toBeCloseTo(100813.7968, 3);
  });

  test("§4 NetworkData", () => {
    const [t] = telemetryOf(samples.networkData);
    const parsed = networkTelemetrySchema.parse(t);
    expect(parsed.ParentId).toBe("cfa0");
    expect(parsed.Etx).toBe(93);
    expect(parsed.Rssi).toBe(73);
  });

  test("§5 HeartbeatData has no DeviceId and string-typed numbers", () => {
    const [t] = telemetryOf(samples.heartbeatData);
    const parsed = heartbeatTelemetrySchema.parse(t);
    expect(parsed.GatewayDeviceId).toBe("cfa0");
    expect(parsed.DiskUsed).toBe(11.4);
    expect(parsed.DataUsage).toBe(123);
    expect(parsed.InternetMode).toBe("LAN");
    // The previous schema demanded a DeviceId here. This is the assertion
    // that a gateway heartbeat is never bounced again.
    expect(nodeTelemetrySchema.safeParse(t).success).toBe(false);
  });

  test("§6 ErrorSensorData, with the Sensor block before the identifiers", () => {
    const [t] = telemetryOf(samples.errorSensorData);
    const parsed = sensorTelemetrySchema.parse(t);
    expect(parsed.DeviceId).toBe("123c");
    expect(parsed.Sensor.Channels[2].Description).toBe("error");
    expect(parsed.Sensor.Channels[2].RawUnitType).toBe("ohms");
  });

  test("§7 retry batch carries several nodes in one push", () => {
    const list = telemetryOf(samples.sensorDataRetryBatch);
    expect(list).toHaveLength(2);
    const ids = list.map((t) => sensorTelemetrySchema.parse(t).DeviceId);
    expect(ids).toEqual(["ecde", "abdc"]);
  });

  test("§8 virtual sensor", () => {
    const [t] = telemetryOf(samples.virtualSensor);
    const parsed = sensorTelemetrySchema.parse(t);
    expect(parsed.Sensor.SensorId).toBe(8);
    expect(parsed.Sensor.SensorType).toBe("Virtual");
  });

  test("§9 analogue node with four sensor types in one push", () => {
    const list = telemetryOf(samples.analogueS4Batch);
    expect(list).toHaveLength(4);
    const types = list.map((t) => sensorTelemetrySchema.parse(t).Sensor.SensorType);
    expect(types).toEqual(["LVDT", "WheatstoneBridge", "Voltage", "CurrentLoop"]);
  });

  test("§10 ShapeArray segment with empty unit strings", () => {
    const [t] = telemetryOf(samples.shapeArray);
    const parsed = sensorTelemetrySchema.parse(t);
    expect(parsed.Sensor.Group).toBe("SAA_GRP");
    expect(parsed.Sensor.Address).toBe("2001");
    expect(parsed.Sensor.Channels[0].UnitType).toBe("");
  });

  test("§12 YieldPoint dMUX with a varying channel count per sensor", () => {
    const list = telemetryOf(samples.yieldPoint);
    const counts = list.map((t) => sensorTelemetrySchema.parse(t).Sensor.Channels.length);
    expect(counts).toEqual([7, 4, 2]);
  });
});

describe("tolerance", () => {
  test("an unknown Type is still a valid envelope", () => {
    const parsed = ackcioEnvelopeSchema.safeParse({ Type: "FutureData", Telemetries: [{}] });
    expect(parsed.success).toBe(true);
  });

  test("a body that is not a push at all is refused", () => {
    expect(ackcioEnvelopeSchema.safeParse({ hello: "world" }).success).toBe(false);
    expect(ackcioEnvelopeSchema.safeParse([]).success).toBe(false);
  });

  test("a millisecond timestamp is taken as one", () => {
    const t = sensorTelemetrySchema.parse({
      DeviceId: "ecde",
      Timestamp: 1544493651000,
      Sensor: { Channels: [] },
    });
    expect(t.Timestamp).toBe(1544493651);
  });

  test("a non-numeric reading is kept as null, not dropped", () => {
    const t = sensorTelemetrySchema.parse({
      DeviceId: "ecde",
      Timestamp: 1544493651,
      Sensor: { Channels: [{ ChannelId: 0, Reading: "NaN", RawReading: "n/a" }] },
    });
    expect(t.Sensor.Channels[0].Reading).toBeNull();
    expect(t.Sensor.Channels[0].RawReading).toBeNull();
  });
});

describe("sensor catalogue", () => {
  test("the channel decides where it names a quantity", () => {
    expect(catalogEntryFor("VibratingWire", "Temperature").typeName).toBe("Temperature");
    expect(catalogEntryFor("VibratingWire", "Frequency").typeName).toBe("Vibrating Wire");
    expect(catalogEntryFor("VibratingWire", "SignalQuality")).toEqual({
      typeName: "Signal Quality",
      auxiliary: true,
    });
  });

  test("the sensor type decides for lettered axes", () => {
    expect(catalogEntryFor("SDI12ENCARDIOTiltmeter", "A").typeName).toBe("Inclinometer");
    expect(catalogEntryFor("RS485MEASURANDShapeArray", "B").typeName).toBe("Shape Array");
    expect(catalogEntryFor("CurrentLoop", "A").typeName).toBe("Current Loop");
    expect(catalogEntryFor("WheatstoneBridge", "A").typeName).toBe("Wheatstone Bridge");
    expect(catalogEntryFor("LVDT", "A").typeName).toBe("LVDT");
    expect(catalogEntryFor("Voltage", "B").typeName).toBe("Voltage");
  });

  test("an unrecognised type keeps its own name rather than a wrong one", () => {
    expect(catalogEntryFor("RS485BSILRT1030", "A").typeName).toBe("RS485 BSILRT1030");
    expect(humaniseAckcioType("SDI12CAMPBELLPiezometer")).toBe("SDI12 CAMPBELLPiezometer");
    expect(humaniseAckcioType("")).toBe("Ackcio Sensor");
  });

  test("sensor names read back to the Ackcio dashboard", () => {
    expect(sensorNameFor("SG2001", "Frequency", 3, 0)).toBe("SG2001 · Frequency");
    expect(sensorNameFor("AN4001", "A", 1, 0)).toBe("AN4001");
    expect(sensorNameFor("", "A", 2, 3)).toBe("Sensor 3 · A");
  });
});

describe("idempotency key", () => {
  const parts = { gatewayKey: "F01E", nodeKey: "ecde", sensorIndex: 0, channelId: 1, ts: 1544493651, isError: false };

  test("is stable across a retry and case-insensitive on the gateway id", () => {
    expect(readingEventId(parts)).toBe(readingEventId({ ...parts, gatewayKey: "f01e" }));
    expect(readingEventId(parts)).toMatch(/^ack:[0-9a-f]{56}$/);
    expect(readingEventId(parts).length).toBeLessThanOrEqual(64);
  });

  test("differs across channel, sensor, time and error state", () => {
    const base = readingEventId(parts);
    expect(readingEventId({ ...parts, channelId: 2 })).not.toBe(base);
    expect(readingEventId({ ...parts, sensorIndex: 1 })).not.toBe(base);
    expect(readingEventId({ ...parts, ts: parts.ts + 1 })).not.toBe(base);
    expect(readingEventId({ ...parts, isError: true })).not.toBe(base);
  });
});
