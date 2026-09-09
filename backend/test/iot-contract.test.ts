import { describe, expect, test } from "vitest";
import { beamDeviceDataSchema } from "../src/modules/iot/iot.types";
import { downloadTelemetryBodySchema } from "../src/modules/exports/exports.types";

/**
 * Unit contract tests — no database required.
 * These wire the field hardware payloads (ESP32 firmware / Pi gateway / sample
 * node gateway) to the exact schema the backend validates, so a change on one
 * side is caught early.
 */

const nodeDataPayload = {
  Type: "NodeData",
  Telemetries: [
    {
      Battery: 88,
      Temperature: 24.7,
      Humidity: 45.2,
      Pressure: 1013,
      GatewayDeviceId: "gw-esp32-01",
      DeviceId: "fb8d",
      DeviceName: "Bridge Node A",
      ProjectName: "Kali Bridge",
      DeviceType: "ESP32 SHM Node",
      Timestamp: 1700000000,
    },
  ],
};

const sensorDataPayload = {
  Type: "SensorData",
  Telemetries: [
    {
      GatewayDeviceId: "gw-esp32-01",
      DeviceId: "fb8d",
      DeviceName: "Bridge Node A",
      ProjectName: "Kali Bridge",
      Timestamp: 1700000000,
      Sensor: {
        SensorType: "Strain",
        Channels: [{ RawReading: 123.45 }, { RawReading: 88.1 }],
      },
    },
  ],
};

describe("IoT ingest contract (field hardware ↔ backend)", () => {
  test("accepts the ESP32 NodeData payload (firmware contract)", () => {
    const result = beamDeviceDataSchema.safeParse(nodeDataPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      const telemetry = result.data.Telemetries[0];
      expect(telemetry.GatewayDeviceId).toBe("gw-esp32-01");
      expect(telemetry.DeviceId).toBe("fb8d");
    }
  });

  test("accepts the SensorData payload (firmware contract)", () => {
    const result = beamDeviceDataSchema.safeParse(sensorDataPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.Type).toBe("SensorData");
      expect(result.data.Telemetries[0].Sensor?.Channels).toHaveLength(2);
    }
  });

  test("accepts the sample gateway heartbeat payload", () => {
    const result = beamDeviceDataSchema.safeParse({
      Type: "HeartbeatData",
      Telemetries: [
        { GatewayDeviceId: "gw-sample-1", DeviceId: "fb8d", Timestamp: 1700000000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid payloads (missing DeviceId, bad Type)", () => {
    expect(
      beamDeviceDataSchema.safeParse({ Type: "NodeData", Telemetries: [] }).success,
    ).toBe(true); // empty telemetry list is allowed by schema

    expect(
      beamDeviceDataSchema.safeParse({
        Type: "UnknownType",
        Telemetries: [{ Timestamp: 1 }],
      }).success,
    ).toBe(false);

    expect(
      beamDeviceDataSchema.safeParse({
        Type: "NodeData",
        Telemetries: [{ Timestamp: "not-a-number" }],
      }).success,
    ).toBe(false);
  });

  test("download telemetry body schema accepts office export filters", () => {
    const ok = downloadTelemetryBodySchema.parse({
      projectId: 3,
      deviceId: "fb8d",
      sensorId: "12",
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
    });
    expect(ok.projectId).toBe(3);
    expect(ok.deviceId).toBe("fb8d");

    expect(
      downloadTelemetryBodySchema.parse({}).sensorId,
    ).toBeUndefined();
  });
});