import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { logger } from "../../utils/logger";
import { recordHeartbeat } from "../gateways/gateways.service";
import { ingestMeasurements, type RawReading } from "../measurements/ingest.service";
import { QUALITY_FLAGS } from "../measurements/quality";
import { catalogEntryFor, sensorNameFor } from "./sensor-catalog";
import {
  heartbeatTelemetrySchema,
  networkTelemetrySchema,
  nodeTelemetrySchema,
  sensorTelemetrySchema,
  type AckcioEnvelope,
  type ChannelReading,
  type SensorTelemetry,
} from "./ackcio.types";

/**
 * Ingest for the Ackcio Beam gateway's HTTP API Push.
 *
 * Three rules shape everything here:
 *
 *   ACKNOWLEDGE, THEN SORT IT OUT. The gateway resends until it gets 200 (spec
 *   §7). Any payload this module can parse is acknowledged, whatever it
 *   decides to do with it; a rejection is written to the log, not sent back
 *   as a status the gateway will retry against for ever.
 *
 *   DISCOVER, DON'T DEMAND. A gateway is registered once, by its
 *   GatewayDeviceId, and that binds everything it sends to one organization.
 *   Nodes and sensors are created the first time they report, named from
 *   what the operator typed into the Ackcio dashboard, so data appears
 *   without anyone hand-mapping channels first. Administrators rename and
 *   re-assign afterwards.
 *
 *   KEEP EVERYTHING. Every channel of every push goes into gateway_readings
 *   as sent. The measurand channels also flow through the measurement
 *   pipeline, so quality flags, alert rules, the live stream and the charts
 *   see them exactly as they see any other reading.
 */

export interface ResolvedGateway {
  id: number;
  tenantId: number;
  gatewayKey: string;
}

/**
 * Who a discovered device or sensor is assigned to.
 *
 * The Devices and Sensors screens list an organization admin's rows by
 * `assignedAdmin`, so a row left unassigned exists in the database and on the
 * gateway page but is invisible to the very administrator whose gateway
 * produced it. The admin who registered the gateway is the natural owner;
 * failing that (a gateway registered by a platform operator, or by someone
 * who has since left), the organization's admin.
 */
async function ownerFor(gateway: ResolvedGateway): Promise<number | null> {
  const row = await prisma.gateway.findUnique({
    where: { id: gateway.id },
    select: { createdBy: true },
  });
  if (row?.createdBy) {
    const member = await prisma.membership.findFirst({
      where: { userId: row.createdBy, tenantId: gateway.tenantId, status: "active" },
      select: { userId: true },
    });
    if (member) return member.userId;
  }
  const orgAdmin = await prisma.membership.findFirst({
    where: { tenantId: gateway.tenantId, status: "active", role: { key: "ORGANIZATION_ADMIN" } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return orgAdmin?.userId ?? null;
}

export interface IngestSummary {
  type: string;
  /** Telemetries in the envelope. */
  received: number;
  /** Rows written (readings, node reports, link reports or heartbeats). */
  stored: number;
  /** Suppressed as already seen. */
  duplicates: number;
  /** Telemetries that could not be used, each with a reason in `notes`. */
  ignored: number;
  notes: string[];
}

/**
 * One push at a time per gateway. A node with eight sensors sends eight POSTs
 * at once, and two of them discovering the same new node concurrently would
 * create it twice. Serialising per gateway costs nothing at the rates these
 * gateways run at and removes the race entirely.
 */
const locks = new Map<number, Promise<unknown>>();

async function withGatewayLock<T>(gatewayId: number, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(gatewayId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  locks.set(gatewayId, run.catch(() => undefined));
  try {
    return await run;
  } finally {
    if (locks.get(gatewayId) === run.catch(() => undefined)) locks.delete(gatewayId);
  }
}

export function sameKey(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function epochToDate(seconds: number): Date {
  return new Date(seconds * 1000);
}

/**
 * Idempotency key for one channel reading. The same push replayed after an
 * outage produces the same key and is stored once. Hashed so it fits the
 * 64-character measurement column whatever the operator named things.
 */
export function readingEventId(parts: {
  gatewayKey: string;
  nodeKey: string;
  sensorIndex: number;
  channelId: number;
  ts: number;
  isError: boolean;
}): string {
  const material = [
    parts.gatewayKey.toLowerCase(),
    parts.nodeKey,
    parts.sensorIndex,
    parts.channelId,
    parts.ts,
    parts.isError ? "e" : "v",
  ].join("|");
  return `ack:${crypto.createHash("sha256").update(material).digest("hex").slice(0, 56)}`;
}

// ─── Discovery ───────────────────────────────────────────────────────────────

type DeviceRow = Prisma.DeviceGetPayload<{
  select: {
    id: true;
    tenantId: true;
    deviceName: true;
    assignSensor: true;
    channelCount: true;
    assignedAdmin: true;
  };
}>;

const DEVICE_SELECT = {
  id: true,
  tenantId: true,
  deviceName: true,
  assignSensor: true,
  channelCount: true,
  assignedAdmin: true,
} as const;

async function deviceTypeIdFor(name: string | undefined): Promise<number> {
  const wanted = (name ?? "").trim() || "Ackcio";
  const existing = await prisma.deviceType.findFirst({
    where: { deviceType: { equals: wanted, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.deviceType.create({
    data: { deviceType: wanted.slice(0, 255), deviceImage: null, status: "one" },
    select: { id: true },
  });
  return created.id;
}

/**
 * The platform Device for an Ackcio node, created on first sight.
 *
 * Looked up under THIS gateway first. A node id is unique within an Ackcio
 * fleet but there is nothing stopping two customers' fleets sharing one, and
 * Device.deviceId is globally unique — so a clash with another tenant's row
 * is resolved by prefixing the serial with the gateway rather than by
 * silently reusing someone else's device.
 */
async function resolveNode(
  gateway: ResolvedGateway,
  nodeKey: string,
  nodeName: string | undefined,
  nodeType: string | undefined,
  seenAt: Date,
  cache: Map<string, DeviceRow>,
  owner: number | null,
): Promise<DeviceRow> {
  const cached = cache.get(nodeKey);
  if (cached) return cached;

  let device = await prisma.device.findFirst({
    where: {
      gatewayId: gateway.id,
      isDelete: "false_",
      OR: [{ deviceId: nodeKey }, { deviceId: `${gateway.gatewayKey}:${nodeKey}` }],
    },
    select: DEVICE_SELECT,
  });

  if (!device) {
    // A device registered by hand against this gateway's identifier, before
    // the gateway row existed or was linked. Adopt it rather than duplicate it.
    const orphan = await prisma.device.findFirst({
      where: {
        deviceId: nodeKey,
        tenantId: gateway.tenantId,
        isDelete: "false_",
        gatewayId: null,
        gatewayDeviceId: { equals: gateway.gatewayKey, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (orphan) {
      device = await prisma.device.update({
        where: { id: orphan.id },
        data: { gatewayId: gateway.id },
        select: DEVICE_SELECT,
      });
    }
  }

  if (!device) {
    const clash = await prisma.device.findUnique({
      where: { deviceId: nodeKey },
      select: { id: true },
    });
    const serial = clash ? `${gateway.gatewayKey}:${nodeKey}` : nodeKey;

    device = await prisma.device.create({
      data: {
        tenantId: gateway.tenantId,
        gatewayId: gateway.id,
        gatewayDeviceId: gateway.gatewayKey,
        deviceId: serial.slice(0, 255),
        deviceName: ((nodeName ?? "").trim() || nodeKey).slice(0, 255),
        deviceType: await deviceTypeIdFor(nodeType),
        assignedAdmin: owner,
        addedBy: owner ?? 0,
        channelCount: 0,
        deviceStatus: "active",
        lifecycle: "active",
        deviceStartDate: seenAt,
        createdAt: seenAt,
        status: "one",
        isDelete: "false_",
        isOngoing: false,
        updateHeartBeat: seenAt,
      },
      select: DEVICE_SELECT,
    });
    logger.info(
      `Ackcio: discovered node ${nodeKey} (${nodeType ?? "unknown type"}) on gateway ${gateway.gatewayKey} as device ${device.id}`,
    );
  } else {
    await prisma.device.update({
      where: { id: device.id },
      data: {
        updateHeartBeat: seenAt,
        lifecycle: "active",
        // A device discovered before an owner could be found is claimed the
        // first time one can be; an existing assignment is never overridden.
        assignedAdmin: device.assignedAdmin === null && owner !== null ? owner : undefined,
      },
    });
  }

  cache.set(nodeKey, device);
  return device;
}

async function sensorTypeIdFor(typeName: string, unit: string | undefined): Promise<number> {
  const existing = await prisma.sensorType.findFirst({
    where: { sensorType: { equals: typeName, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.sensorType.create({
    data: {
      sensorType: typeName.slice(0, 255),
      // No icon has been drawn for a type the gateway introduced. Empty is
      // rendered as "no image" by formatImageUrl; a borrowed icon would be a
      // picture of the wrong instrument.
      sensorIcon: "",
      calibrationValue: "1",
      status: "one",
      unit: (unit ?? "").slice(0, 255) || null,
    },
    select: { id: true },
  });
  return created.id;
}

/** Channel identity on a device: "<SensorId>.<ChannelId>". */
export function channelNumberFor(sensorIndex: number, channelId: number): string {
  return `${sensorIndex}.${channelId}`;
}

/**
 * The platform Sensor for one channel of one Ackcio sensor, created on first
 * sight together with the DeviceChannel row that records the mapping. The
 * channel row is what the console's channel and dashboard screens already
 * read, so a discovered sensor shows up there like any other.
 */
async function resolveChannelSensor(
  gateway: ResolvedGateway,
  device: DeviceRow,
  telemetry: SensorTelemetry,
  channel: ChannelReading,
  channelId: number,
  sensorIndex: number,
  seenAt: Date,
  owner: number | null,
): Promise<number> {
  const channelNumber = channelNumberFor(sensorIndex, channelId);

  const mapped = await prisma.deviceChannel.findFirst({
    where: { deviceId: String(device.id), channelNumber },
    select: { id: true, assignSensor: true },
  });
  if (mapped?.assignSensor) {
    const sensorId = Number(mapped.assignSensor);
    const exists = await prisma.sensor.findUnique({ where: { id: sensorId }, select: { id: true } });
    if (exists) return sensorId;
  }

  const entry = catalogEntryFor(telemetry.Sensor.SensorType, channel.ChannelType);
  const unit = (channel.UnitType ?? "").trim() || (channel.RawUnitType ?? "").trim();
  const sensorName = sensorNameFor(
    telemetry.Sensor.Code,
    channel.ChannelType,
    telemetry.Sensor.Channels.length,
    sensorIndex,
  );

  const sensor = await prisma.sensor.create({
    data: {
      tenantId: gateway.tenantId,
      sensorName,
      sensorTypeID: await sensorTypeIdFor(entry.typeName, unit),
      assignedAdmin: owner,
      calibrationValue: "1",
      unit: unit.slice(0, 32),
      status: "one",
      createdAt: seenAt,
    },
    select: { id: true },
  });

  const channelData = {
    channelName: sensorName,
    assignSensor: String(sensor.id),
    // Signal quality and supply voltage describe the instrument, not the
    // structure, so they are recorded but not put on the project dashboard.
    activeStatus: entry.auxiliary ? ("zero" as const) : ("one" as const),
  };
  if (mapped) {
    await prisma.deviceChannel.update({ where: { id: mapped.id }, data: channelData });
  } else {
    await prisma.deviceChannel.create({
      data: { deviceId: String(device.id), channelNumber, ...channelData },
    });
  }

  await prisma.sensorAssignment.create({
    data: {
      tenantId: gateway.tenantId,
      sensorId: sensor.id,
      deviceId: device.id,
      channelNumber,
      validFrom: seenAt,
      notes: `Discovered from Ackcio push: ${telemetry.Sensor.SensorType ?? "sensor"} ${telemetry.Sensor.Code ?? ""} channel ${channel.ChannelType ?? channelId}`.trim(),
    },
  });

  // The device's own list of its sensors, which the project form and the
  // device list read to decide whether a device can be attached to a project.
  let assigned: number[] = [];
  try {
    assigned = device.assignSensor ? (JSON.parse(device.assignSensor) as number[]) : [];
  } catch {
    assigned = [];
  }
  if (!assigned.includes(sensor.id)) assigned.push(sensor.id);
  const channelCount = await prisma.deviceChannel.count({ where: { deviceId: String(device.id) } });
  await prisma.device.update({
    where: { id: device.id },
    data: { assignSensor: JSON.stringify(assigned), channelCount },
  });
  device.assignSensor = JSON.stringify(assigned);
  device.channelCount = channelCount;

  // Debug, not info: a 100-segment chain is 400 of these on first contact.
  logger.debug(
    `Ackcio: discovered sensor "${sensorName}" (${entry.typeName}) on device ${device.id} channel ${channelNumber} as sensor ${sensor.id}`,
  );
  return sensor.id;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleSensorData(
  gateway: ResolvedGateway,
  items: unknown[],
  isError: boolean,
  summary: IngestSummary,
): Promise<void> {
  const receivedAt = new Date();
  const nodes = new Map<string, DeviceRow>();
  const owner = await ownerFor(gateway);
  const readingRows: Prisma.GatewayReadingCreateManyInput[] = [];
  /** Measurement readings grouped by the device they belong to. */
  const perDevice = new Map<number, RawReading[]>();
  /** Compatibility rows for the legacy sensor_data table, per running project. */
  const compat: Array<Prisma.SensorDataCreateManyInput & { eventId: string }> = [];
  const projectByDevice = new Map<number, number | null>();

  for (const item of items) {
    const parsed = sensorTelemetrySchema.safeParse(item);
    if (!parsed.success) {
      summary.ignored += 1;
      summary.notes.push(`telemetry skipped: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    const t = parsed.data;
    if (t.GatewayDeviceId && !sameKey(t.GatewayDeviceId, gateway.gatewayKey)) {
      summary.ignored += 1;
      summary.notes.push(`telemetry for gateway ${t.GatewayDeviceId} arrived on ${gateway.gatewayKey}'s URL; skipped`);
      continue;
    }

    const ts = epochToDate(t.Timestamp);
    const device = await resolveNode(gateway, t.DeviceId, t.DeviceName, t.DeviceType, receivedAt, nodes, owner);
    const sensorIndex = t.Sensor.SensorId ?? 0;

    if (!projectByDevice.has(device.id)) {
      // The project that owns the GATEWAY, when it is collecting. A project
      // that claimed a device directly, the older arrangement, still counts.
      const project =
        (await prisma.project.findFirst({
          where: { gateway: { id: gateway.id }, isDelete: false, status: "start" },
          select: { id: true },
        })) ??
        (await prisma.project.findFirst({
          where: { deviceId: String(device.id), isDelete: false, status: "start" },
          select: { id: true },
        }));
      projectByDevice.set(device.id, project?.id ?? null);
    }
    const projectId = projectByDevice.get(device.id) ?? null;

    for (let i = 0; i < t.Sensor.Channels.length; i++) {
      const channel = t.Sensor.Channels[i];
      const channelId = channel.ChannelId ?? i;
      const sensorId = await resolveChannelSensor(gateway, device, t, channel, channelId, sensorIndex, ts, owner);
      const eventId = readingEventId({
        gatewayKey: gateway.gatewayKey,
        nodeKey: t.DeviceId,
        sensorIndex,
        channelId,
        ts: t.Timestamp,
        isError,
      });
      const reading = channel.Reading ?? null;
      const rawReading = channel.RawReading ?? null;
      const description = channel.Description?.trim() || null;
      // An ErrorSensorData payload carries EVERY channel of the sensor, with
      // the gateway's verdict on each: the one that failed its configured
      // range says "error", its siblings still say "valid". The flag follows
      // the verdict, not the envelope, so a good temperature reading is not
      // marked out of range because the strain channel beside it was.
      const gatewaySaysValid =
        description === null ? !isError : description.toLowerCase() === "valid";

      readingRows.push({
        ts,
        tenantId: gateway.tenantId,
        gatewayId: gateway.id,
        deviceId: device.id,
        sensorId,
        gatewayKey: gateway.gatewayKey,
        nodeKey: t.DeviceId,
        nodeName: t.DeviceName ?? null,
        nodeType: t.DeviceType ?? null,
        projectName: t.ProjectName ?? null,
        sensorIndex,
        code: t.Sensor.Code ?? null,
        group: t.Sensor.Group ?? null,
        sensorType: t.Sensor.SensorType ?? null,
        address: t.Sensor.Address ?? null,
        channelId,
        channelType: channel.ChannelType ?? null,
        rawChannelType: channel.RawChannelType ?? null,
        reading,
        rawReading,
        unit: channel.UnitType ?? null,
        rawUnit: channel.RawUnitType ?? null,
        description,
        isError,
        eventId,
        ingestedAt: receivedAt,
      });

      // The number the platform acts on: the gateway's engineering value,
      // falling back to the raw one when no formula was configured (the spec
      // says the two are then equal). A channel with no number at all is
      // still recorded — with NaN, which the pipeline stores as NOT_FINITE.
      const list = perDevice.get(device.id) ?? [];
      list.push({
        sensorId,
        ts,
        rawValue: rawReading ?? Number.NaN,
        value: reading ?? rawReading ?? Number.NaN,
        eventId,
        extraFlags: gatewaySaysValid ? [] : [QUALITY_FLAGS.OUT_OF_RANGE],
      });
      perDevice.set(device.id, list);

      if (projectId !== null && gatewaySaysValid) {
        const value = reading ?? rawReading;
        if (value !== null) {
          compat.push({
            eventId,
            projectId,
            deviceId: t.DeviceId,
            sensorId: String(sensorId),
            sensorData: value,
            createdAt: ts,
          });
        }
      }
    }
  }

  if (readingRows.length === 0) return;

  // Which of these has been seen before, so the legacy table below — which
  // has no idempotency key of its own — is only fed the genuinely new ones.
  // A retry batch mixes replayed and fresh readings in one push.
  const seen = new Set(
    (
      await prisma.gatewayReading.findMany({
        where: { eventId: { in: readingRows.map((r) => r.eventId) } },
        select: { eventId: true },
      })
    ).map((r) => r.eventId),
  );

  const inserted = await prisma.gatewayReading.createMany({
    data: readingRows,
    skipDuplicates: true,
  });
  summary.stored += inserted.count;
  summary.duplicates += readingRows.length - inserted.count;

  for (const [deviceId, readings] of perDevice) {
    await ingestMeasurements(readings, {
      tenantId: gateway.tenantId,
      deviceId,
      gatewayId: gateway.id,
      receivedAt,
    }).catch((err) => {
      // The full record is already in gateway_readings; a fault in the
      // derived pipeline must not cost the push its acknowledgement.
      logger.error("Ackcio: measurement pipeline failed", err as Error);
      summary.notes.push("measurement pipeline failed; readings kept in gateway_readings");
    });
  }

  // Only the new ones: replaying a buffered hour into sensor_data, which has
  // no idempotency key, would double every legacy report.
  const freshCompat = compat.filter((row) => !seen.has(row.eventId));
  if (freshCompat.length > 0) {
    await prisma.sensorData
      .createMany({ data: freshCompat.map(({ eventId: _omit, ...row }) => row) })
      .catch((err) => {
        logger.error("Ackcio: legacy sensor_data write failed", err as Error);
      });
  }
}

async function handleNodeData(
  gateway: ResolvedGateway,
  items: unknown[],
  summary: IngestSummary,
): Promise<void> {
  const receivedAt = new Date();
  const nodes = new Map<string, DeviceRow>();
  const owner = await ownerFor(gateway);
  const rows: Prisma.NodeDataCreateManyInput[] = [];

  for (const item of items) {
    const parsed = nodeTelemetrySchema.safeParse(item);
    if (!parsed.success) {
      summary.ignored += 1;
      summary.notes.push(`node report skipped: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    const t = parsed.data;
    if (t.GatewayDeviceId && !sameKey(t.GatewayDeviceId, gateway.gatewayKey)) {
      summary.ignored += 1;
      summary.notes.push(`node report for gateway ${t.GatewayDeviceId} skipped`);
      continue;
    }
    await resolveNode(gateway, t.DeviceId, t.DeviceName, t.DeviceType, receivedAt, nodes, owner);

    // The node_data columns for environment are NOT NULL, and writing 0 for a
    // figure the node did not send would invent a reading. The spec says a
    // node always sends all four; one that does not is recorded in the log.
    if (t.Temperature === undefined || t.Humidity === undefined || t.Pressure === undefined) {
      summary.ignored += 1;
      summary.notes.push(`node ${t.DeviceId} report lacked temperature, humidity or pressure; skipped`);
      continue;
    }
    rows.push({
      battery: null,
      batteryMillivolts: t.Battery !== undefined ? Math.round(t.Battery) : null,
      temperature: t.Temperature,
      humidity: t.Humidity,
      pressure: t.Pressure,
      gatewayDeviceId: gateway.gatewayKey,
      deviceId: t.DeviceId,
      deviceName: t.DeviceName ?? null,
      projectName: t.ProjectName ?? null,
      deviceType: t.DeviceType ?? null,
      deviceUpdatedAt: epochToDate(t.Timestamp),
      createdAt: receivedAt,
    });
  }

  if (rows.length > 0) {
    const inserted = await prisma.nodeData.createMany({ data: rows });
    summary.stored += inserted.count;
  }
}

async function handleNetworkData(
  gateway: ResolvedGateway,
  items: unknown[],
  summary: IngestSummary,
): Promise<void> {
  const receivedAt = new Date();
  const nodes = new Map<string, DeviceRow>();
  const owner = await ownerFor(gateway);
  const rows: Prisma.NodeNetworkDataCreateManyInput[] = [];

  for (const item of items) {
    const parsed = networkTelemetrySchema.safeParse(item);
    if (!parsed.success) {
      summary.ignored += 1;
      summary.notes.push(`link report skipped: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    const t = parsed.data;
    if (t.GatewayDeviceId && !sameKey(t.GatewayDeviceId, gateway.gatewayKey)) {
      summary.ignored += 1;
      summary.notes.push(`link report for gateway ${t.GatewayDeviceId} skipped`);
      continue;
    }
    const device = await resolveNode(gateway, t.DeviceId, t.DeviceName, t.DeviceType, receivedAt, nodes, owner);
    rows.push({
      ts: epochToDate(t.Timestamp),
      tenantId: gateway.tenantId,
      gatewayId: gateway.id,
      deviceId: device.id,
      gatewayKey: gateway.gatewayKey,
      nodeKey: t.DeviceId,
      parentKey: t.ParentId ?? null,
      etx: t.Etx ?? null,
      rssi: t.Rssi ?? null,
      ingestedAt: receivedAt,
    });
  }

  if (rows.length > 0) {
    const inserted = await prisma.nodeNetworkData.createMany({ data: rows });
    summary.stored += inserted.count;
  }
}

async function handleHeartbeatData(
  gateway: ResolvedGateway,
  items: unknown[],
  summary: IngestSummary,
): Promise<void> {
  const receivedAt = new Date();
  const rows: Prisma.GatewayHeartbeatCreateManyInput[] = [];

  for (const item of items) {
    const parsed = heartbeatTelemetrySchema.safeParse(item);
    if (!parsed.success) {
      summary.ignored += 1;
      summary.notes.push(`heartbeat skipped: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    const t = parsed.data;
    if (t.GatewayDeviceId && !sameKey(t.GatewayDeviceId, gateway.gatewayKey)) {
      summary.ignored += 1;
      summary.notes.push(`heartbeat for gateway ${t.GatewayDeviceId} skipped`);
      continue;
    }
    rows.push({
      ts: epochToDate(t.Timestamp),
      tenantId: gateway.tenantId,
      gatewayId: gateway.id,
      gatewayKey: gateway.gatewayKey,
      disk: t.Disk ?? null,
      diskUsed: t.DiskUsed ?? null,
      diskSpace: t.DiskSpace ?? null,
      powerInVolts: t.PowerInVolts ?? null,
      powerInCurrent: t.PowerInCurrent ?? null,
      temperature: t.Temperature ?? null,
      humidity: t.Humidity ?? null,
      pressure: t.Pressure ?? null,
      dataUsage: t.DataUsage ?? null,
      internetMode: t.InternetMode ?? null,
      ingestedAt: receivedAt,
    });
  }

  if (rows.length > 0) {
    const inserted = await prisma.gatewayHeartbeat.createMany({ data: rows });
    summary.stored += inserted.count;
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function ingestAckcioPayload(
  envelope: AckcioEnvelope,
  gateway: ResolvedGateway,
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    type: envelope.Type,
    received: envelope.Telemetries.length,
    stored: 0,
    duplicates: 0,
    ignored: 0,
    notes: [],
  };

  // Liveness first, and from the wall clock: the gateway is talking to us
  // NOW, whatever the timestamps inside the payload say. Recording a replayed
  // buffer's timestamp here would show a healthy gateway as hours stale.
  await recordHeartbeat({ gatewayKey: gateway.gatewayKey, seenAt: new Date() }).catch(() => {
    // Never let gateway bookkeeping reject field telemetry.
  });

  await withGatewayLock(gateway.id, async () => {
    switch (envelope.Type) {
      case "SensorData":
        await handleSensorData(gateway, envelope.Telemetries, false, summary);
        break;
      case "ErrorSensorData":
        await handleSensorData(gateway, envelope.Telemetries, true, summary);
        break;
      case "NodeData":
        await handleNodeData(gateway, envelope.Telemetries, summary);
        break;
      case "NetworkData":
        await handleNetworkData(gateway, envelope.Telemetries, summary);
        break;
      case "HeartbeatData":
        await handleHeartbeatData(gateway, envelope.Telemetries, summary);
        break;
      default:
        summary.ignored = summary.received;
        summary.notes.push(`unknown payload type "${envelope.Type}" acknowledged and ignored`);
        logger.warn(
          `Ackcio: gateway ${gateway.gatewayKey} sent unknown Type "${envelope.Type}" (${summary.received} telemetries)`,
        );
    }
  });

  if (summary.ignored > 0) {
    logger.warn(
      `Ackcio: ${summary.ignored} of ${summary.received} ${envelope.Type} telemetries from ${gateway.gatewayKey} ignored: ${summary.notes.join("; ")}`,
    );
  }

  return summary;
}
