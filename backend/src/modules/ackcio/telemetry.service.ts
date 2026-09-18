import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { connectivityOf } from "../gateways/gateways.service";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";

/**
 * What a gateway is reporting right now, node by node.
 *
 * Read-only, and every figure is the latest stored fact: the newest reading
 * per channel, the newest node health report, the newest link report and
 * the newest gateway heartbeat. Nothing is derived from the wall clock
 * except the connectivity word, which the gateway list already computes the
 * same way. A node that has never sent a health report has `health: null`
 * rather than a battery of 0.
 */

export interface ChannelSnapshot {
  sensorIndex: number;
  channelId: number;
  channelNumber: string;
  code: string | null;
  group: string | null;
  sensorType: string | null;
  channelType: string | null;
  address: string | null;
  sensorId: number | null;
  sensorName: string | null;
  platformType: string | null;
  reading: number | null;
  rawReading: number | null;
  unit: string | null;
  rawUnit: string | null;
  description: string | null;
  isError: boolean;
  ts: string;
}

export interface NodeSnapshot {
  device: {
    id: number;
    nodeKey: string | null;
    name: string;
    type: string | null;
    lifecycle: string;
    lastSeenAt: string | null;
  };
  health: {
    ts: string;
    batteryMillivolts: number | null;
    batteryPercent: number | null;
    temperature: number;
    humidity: number;
    pressure: number;
  } | null;
  link: {
    ts: string;
    parentKey: string | null;
    etx: number | null;
    rssi: number | null;
  } | null;
  channels: ChannelSnapshot[];
}

export interface GatewayTelemetry {
  gateway: {
    id: number;
    name: string;
    gatewayKey: string;
    status: string;
    connectivity: string;
    secondsSinceLastSeen: number | null;
    lastSeenAt: string | null;
    hasIngestToken: boolean;
    ingestTokenIssuedAt: string | null;
    ingestTokenLastUsedAt: string | null;
  };
  heartbeat: {
    ts: string;
    disk: string | null;
    diskUsed: number | null;
    diskSpace: number | null;
    powerInVolts: number | null;
    powerInCurrent: number | null;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    dataUsage: number | null;
    internetMode: string | null;
  } | null;
  nodes: NodeSnapshot[];
}

interface LatestReadingRow {
  deviceId: number;
  sensorIndex: number;
  channelId: number;
  code: string | null;
  group: string | null;
  sensorType: string | null;
  channelType: string | null;
  address: string | null;
  sensorId: number | null;
  reading: number | null;
  rawReading: number | null;
  unit: string | null;
  rawUnit: string | null;
  description: string | null;
  isError: boolean;
  ts: Date;
}

export async function getGatewayTelemetry(ctx: AuthContext, gatewayId: number): Promise<GatewayTelemetry> {
  const gateway = await prisma.gateway.findFirst({
    where: { id: gatewayId, ...tenantScope(ctx) },
    select: {
      id: true,
      name: true,
      gatewayKey: true,
      status: true,
      lastSeenAt: true,
      ingestTokenHash: true,
      ingestTokenIssuedAt: true,
      ingestTokenLastUsedAt: true,
    },
  });
  if (!gateway) throw new NotFoundError("Gateway not found");

  const [devices, heartbeat] = await Promise.all([
    prisma.device.findMany({
      where: { gatewayId: gateway.id, isDelete: "false_" },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        lifecycle: true,
        updateHeartBeat: true,
        deviceTypeRecord: { select: { deviceType: true } },
      },
      orderBy: { deviceName: "asc" },
    }),
    prisma.gatewayHeartbeat.findFirst({
      where: { gatewayId: gateway.id },
      orderBy: { ts: "desc" },
    }),
  ]);

  const deviceIds = devices.map((d) => d.id);
  const latest: LatestReadingRow[] = deviceIds.length
    ? await prisma.$queryRaw<LatestReadingRow[]>(Prisma.sql`
        SELECT DISTINCT ON ("deviceId", "sensorIndex", "channelId")
          "deviceId", "sensorIndex", "channelId", "code", "group", "sensorType",
          "channelType", "address", "sensorId", "reading", "rawReading", "unit",
          "rawUnit", "description", "isError", "ts"
        FROM "gateway_readings"
        WHERE "gatewayId" = ${gateway.id}
          AND "deviceId" IN (${Prisma.join(deviceIds)})
        ORDER BY "deviceId", "sensorIndex", "channelId", "ts" DESC, "id" DESC
      `)
    : [];

  const sensorIds = [...new Set(latest.map((r) => r.sensorId).filter((v): v is number => v !== null))];
  const sensors = sensorIds.length
    ? await prisma.sensor.findMany({
        where: { id: { in: sensorIds } },
        select: { id: true, sensorName: true, sensorType: { select: { sensorType: true } } },
      })
    : [];
  const sensorById = new Map(sensors.map((s) => [s.id, s]));

  const nodeKeys = devices.map((d) => d.deviceId).filter((v): v is string => Boolean(v));
  const [healthRows, linkRows] = await Promise.all([
    nodeKeys.length
      ? prisma.$queryRaw<
          Array<{
            deviceId: string;
            deviceUpdatedAt: Date;
            battery: number | null;
            batteryMillivolts: number | null;
            temperature: number;
            humidity: number;
            pressure: number;
          }>
        >(Prisma.sql`
          SELECT DISTINCT ON ("deviceId")
            "deviceId", "deviceUpdatedAt", "battery", "batteryMillivolts",
            "temperature", "humidity", "pressure"
          FROM "node_data"
          WHERE "gatewayDeviceId" = ${gateway.gatewayKey}
            AND "deviceId" IN (${Prisma.join(nodeKeys)})
          ORDER BY "deviceId", "deviceUpdatedAt" DESC, "id" DESC
        `)
      : Promise.resolve([]),
    deviceIds.length
      ? prisma.$queryRaw<
          Array<{ deviceId: number; ts: Date; parentKey: string | null; etx: number | null; rssi: number | null }>
        >(Prisma.sql`
          SELECT DISTINCT ON ("deviceId") "deviceId", "ts", "parentKey", "etx", "rssi"
          FROM "node_network_data"
          WHERE "gatewayId" = ${gateway.id} AND "deviceId" IN (${Prisma.join(deviceIds)})
          ORDER BY "deviceId", "ts" DESC, "id" DESC
        `)
      : Promise.resolve([]),
  ]);
  const healthByNode = new Map(healthRows.map((h) => [h.deviceId, h]));
  const linkByDevice = new Map(linkRows.map((l) => [l.deviceId, l]));

  const nodes: NodeSnapshot[] = devices.map((d) => {
    const health = d.deviceId ? healthByNode.get(d.deviceId) : undefined;
    const link = linkByDevice.get(d.id);
    const channels = latest
      .filter((r) => r.deviceId === d.id)
      .sort((a, b) => a.sensorIndex - b.sensorIndex || a.channelId - b.channelId)
      .map((r): ChannelSnapshot => {
        const sensor = r.sensorId !== null ? sensorById.get(r.sensorId) : undefined;
        return {
          sensorIndex: r.sensorIndex,
          channelId: r.channelId,
          channelNumber: `${r.sensorIndex}.${r.channelId}`,
          code: r.code,
          group: r.group,
          sensorType: r.sensorType,
          channelType: r.channelType,
          address: r.address,
          sensorId: r.sensorId,
          sensorName: sensor?.sensorName ?? null,
          platformType: sensor?.sensorType.sensorType ?? null,
          reading: r.reading,
          rawReading: r.rawReading,
          unit: r.unit,
          rawUnit: r.rawUnit,
          description: r.description,
          isError: r.isError,
          ts: r.ts.toISOString(),
        };
      });

    return {
      device: {
        id: d.id,
        nodeKey: d.deviceId,
        name: d.deviceName,
        type: d.deviceTypeRecord?.deviceType ?? null,
        lifecycle: d.lifecycle,
        lastSeenAt: d.updateHeartBeat ? d.updateHeartBeat.toISOString() : null,
      },
      health: health
        ? {
            ts: health.deviceUpdatedAt.toISOString(),
            batteryMillivolts: health.batteryMillivolts,
            batteryPercent: health.battery,
            temperature: health.temperature,
            humidity: health.humidity,
            pressure: health.pressure,
          }
        : null,
      link: link
        ? { ts: link.ts.toISOString(), parentKey: link.parentKey, etx: link.etx, rssi: link.rssi }
        : null,
      channels,
    };
  });

  const connectivity = connectivityOf(gateway.lastSeenAt);
  return {
    gateway: {
      id: gateway.id,
      name: gateway.name,
      gatewayKey: gateway.gatewayKey,
      status: gateway.status,
      connectivity: connectivity.state,
      secondsSinceLastSeen: connectivity.secondsSinceLastSeen,
      lastSeenAt: gateway.lastSeenAt ? gateway.lastSeenAt.toISOString() : null,
      hasIngestToken: gateway.ingestTokenHash !== null,
      ingestTokenIssuedAt: gateway.ingestTokenIssuedAt?.toISOString() ?? null,
      ingestTokenLastUsedAt: gateway.ingestTokenLastUsedAt?.toISOString() ?? null,
    },
    heartbeat: heartbeat
      ? {
          ts: heartbeat.ts.toISOString(),
          disk: heartbeat.disk,
          diskUsed: heartbeat.diskUsed,
          diskSpace: heartbeat.diskSpace,
          powerInVolts: heartbeat.powerInVolts,
          powerInCurrent: heartbeat.powerInCurrent,
          temperature: heartbeat.temperature,
          humidity: heartbeat.humidity,
          pressure: heartbeat.pressure,
          dataUsage: heartbeat.dataUsage,
          internetMode: heartbeat.internetMode,
        }
      : null,
    nodes,
  };
}
