import { z } from "zod";

/**
 * The Ackcio Beam gateway's HTTP(S) API Push payloads, as specified in
 * "ACKCIO Beam Gateway API Specification" v1.18.
 *
 * Validation here is deliberately FORGIVING. Section 7 of the spec is the
 * governing constraint: the gateway resends a payload until it receives 200,
 * so a strict schema that refuses a field it did not expect turns one odd
 * packet into an infinite retry against this server. Everything optional is
 * optional, numbers that the spec types as strings (the heartbeat's disk and
 * data figures) are coerced, and an unknown `Type` is accepted and logged
 * rather than rejected. What must be present is what the data is meaningless
 * without: the node, the timestamp, and for a reading its channels.
 */

/** A number, or a numeric string, or nothing. Never NaN. */
const looseNumber = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}, z.number().optional());

/**
 * Readings arrive as JSON numbers, but a gateway can emit NaN or Infinity for
 * a failed channel; those are kept as null rather than dropped, so the row
 * still records that the channel reported at that instant.
 */
const readingNumber = z.preprocess((v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}, z.number().nullable());

const looseString = z.preprocess(
  (v) => (v === null || v === undefined ? undefined : String(v)),
  z.string().optional(),
);

const looseInt = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
}, z.number().int().optional());

/** Epoch seconds per the spec; a value that is clearly milliseconds is taken as such. */
export const epochSchema = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return undefined;
  return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
}, z.number().int().positive());

export const channelSchema = z.object({
  ChannelId: looseInt,
  ChannelType: looseString,
  RawChannelType: looseString,
  RawReading: readingNumber.optional(),
  RawUnitType: looseString,
  Reading: readingNumber.optional(),
  UnitType: looseString,
  Description: looseString,
});

export const sensorSchema = z.object({
  SensorId: looseInt,
  Code: looseString,
  Group: looseString,
  SensorType: looseString,
  Address: looseString,
  Channels: z.array(channelSchema).default([]),
});

/** Fields every telemetry kind shares. Only the gateway and time are required. */
const telemetryBase = {
  GatewayDeviceId: looseString,
  DeviceId: looseString,
  DeviceName: looseString,
  DeviceType: looseString,
  ProjectName: looseString,
  Timestamp: epochSchema,
};

export const sensorTelemetrySchema = z.object({
  ...telemetryBase,
  DeviceId: z.string().min(1),
  Sensor: sensorSchema,
});

export const nodeTelemetrySchema = z.object({
  ...telemetryBase,
  DeviceId: z.string().min(1),
  /** Millivolts. */
  Battery: looseNumber,
  /** Celsius. */
  Temperature: looseNumber,
  /** Percent. */
  Humidity: looseNumber,
  /** Pascal. */
  Pressure: looseNumber,
});

export const networkTelemetrySchema = z.object({
  ...telemetryBase,
  DeviceId: z.string().min(1),
  ParentId: looseString,
  /** Percent. */
  Etx: looseInt,
  /** dBm. */
  Rssi: looseInt,
});

/**
 * Gateway health. Note there is NO DeviceId: this is the gateway speaking
 * about itself. The previous ingest schema required one and so answered every
 * Ackcio heartbeat with 400, which the gateway then retried indefinitely.
 */
export const heartbeatTelemetrySchema = z.object({
  GatewayDeviceId: looseString,
  Timestamp: epochSchema,
  Disk: looseString,
  DiskUsed: looseNumber,
  DiskSpace: looseNumber,
  PowerInVolts: looseNumber,
  PowerInCurrent: looseNumber,
  Temperature: looseNumber,
  Humidity: looseNumber,
  Pressure: looseNumber,
  DataUsage: looseNumber,
  InternetMode: looseString,
});

export const ACKCIO_TYPES = [
  "SensorData",
  "ErrorSensorData",
  "NodeData",
  "NetworkData",
  "HeartbeatData",
] as const;
export type AckcioType = (typeof ACKCIO_TYPES)[number];

/**
 * The envelope. `Type` is any string so an unknown kind is acknowledged and
 * logged instead of retried forever; the service decides what to do with it.
 */
export const ackcioEnvelopeSchema = z.object({
  Type: z.string().min(1),
  Version: looseString,
  Telemetries: z.array(z.unknown()).default([]),
});

export type AckcioEnvelope = z.infer<typeof ackcioEnvelopeSchema>;
export type SensorTelemetry = z.infer<typeof sensorTelemetrySchema>;
export type NodeTelemetry = z.infer<typeof nodeTelemetrySchema>;
export type NetworkTelemetry = z.infer<typeof networkTelemetrySchema>;
export type HeartbeatTelemetry = z.infer<typeof heartbeatTelemetrySchema>;
export type ChannelReading = z.infer<typeof channelSchema>;
