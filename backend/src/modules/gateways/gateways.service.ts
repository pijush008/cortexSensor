import { randomBytes } from "crypto";
import { GatewayStatus, Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/AppError";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";
import type {
  CreateGatewayInput,
  ListGatewaysQuery,
  UpdateGatewayInput,
} from "./gateways.types";

/**
 * Edge gateways.
 *
 * Everything reported here is a stored fact. Where a gateway has never sent a
 * heartbeat, `lastSeenAt` is null and the API says so — it does not synthesise
 * "offline for 0 minutes", and it does not invent CPU, battery or buffer
 * figures. That distinction is the whole reason the previous gateways screen
 * had to be replaced.
 */

/**
 * A gateway is considered to have gone quiet after three missed heartbeats.
 * Field gateways report on a 60s cadence, so this tolerates one lost packet
 * and a retry before raising concern.
 */
export const HEARTBEAT_INTERVAL_SECONDS = 60;
export const OFFLINE_AFTER_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3;

export type Connectivity = "never_reported" | "online" | "stale" | "offline";

/**
 * Connectivity is DERIVED from the last heartbeat, never stored as an opinion.
 * A stored "online" flag goes stale the moment a gateway dies quietly, which is
 * exactly the failure an operator needs to see.
 */
export function connectivityOf(lastSeenAt: Date | null): {
  state: Connectivity;
  secondsSinceLastSeen: number | null;
} {
  if (!lastSeenAt) return { state: "never_reported", secondsSinceLastSeen: null };
  const seconds = Math.max(0, Math.floor((Date.now() - lastSeenAt.getTime()) / 1000));
  if (seconds <= HEARTBEAT_INTERVAL_SECONDS * 1.5) {
    return { state: "online", secondsSinceLastSeen: seconds };
  }
  if (seconds <= OFFLINE_AFTER_SECONDS) {
    return { state: "stale", secondsSinceLastSeen: seconds };
  }
  return { state: "offline", secondsSinceLastSeen: seconds };
}

type GatewayRow = Prisma.GatewayGetPayload<{
  include: { _count: { select: { devices: true } } };
}>;

function serialize(row: GatewayRow) {
  const connectivity = connectivityOf(row.lastSeenAt);
  return {
    id: row.id,
    publicId: row.publicId,
    gatewayKey: row.gatewayKey,
    name: row.name,
    description: row.description,
    status: row.status,
    firmwareVersion: row.firmwareVersion,
    hardwareModel: row.hardwareModel,
    projectId: row.projectId,
    structureId: row.structureId,
    locationId: row.locationId,
    lastSeenAt: row.lastSeenAt,
    // Null, not 0: a gateway that has never reported has an unknown buffer
    // depth, which is a different fact from an empty buffer.
    bufferedCount: row.bufferedCount,
    deviceCount: row._count.devices,
    connectivity: connectivity.state,
    secondsSinceLastSeen: connectivity.secondsSinceLastSeen,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listGateways(ctx: AuthContext, query: ListGatewaysQuery) {
  const where: Prisma.GatewayWhereInput = { ...tenantScope(ctx) };
  if (query.status) where.status = query.status;
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { gatewayKey: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.gateway.count({ where }),
    prisma.gateway.findMany({
      where,
      include: { _count: { select: { devices: true } } },
      orderBy: [{ name: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(serialize),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getGateway(ctx: AuthContext, id: number) {
  const row = await prisma.gateway.findFirst({
    where: { id, ...tenantScope(ctx) },
    include: { _count: { select: { devices: true } } },
  });
  if (!row) throw new NotFoundError("Gateway not found");
  return serialize(row);
}

export async function createGateway(ctx: AuthContext, input: CreateGatewayInput) {
  if (ctx.tenantId === null) {
    throw new BadRequestError("An active organization is required to register a gateway");
  }

  // gatewayKey is globally unique because ingest resolves a gateway by it
  // before any tenant context exists. A clash across tenants would silently
  // route one customer's telemetry into another's account.
  const clash = await prisma.gateway.findUnique({
    where: { gatewayKey: input.gatewayKey },
    select: { id: true },
  });
  if (clash) {
    throw new BadRequestError(
      `Gateway identifier "${input.gatewayKey}" is already registered`,
    );
  }

  if (input.structureId) {
    const structure = await prisma.structure.findFirst({
      where: { id: input.structureId, ...tenantScope(ctx) },
      select: { id: true },
    });
    if (!structure) throw new NotFoundError("Structure not found");
  }

  const row = await prisma.gateway.create({
    data: {
      publicId: `gw_${randomBytes(12).toString("hex")}`,
      tenantId: ctx.tenantId,
      gatewayKey: input.gatewayKey,
      name: input.name,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      structureId: input.structureId ?? null,
      locationId: input.locationId ?? null,
      firmwareVersion: input.firmwareVersion ?? null,
      hardwareModel: input.hardwareModel ?? null,
      status: GatewayStatus.provisioning,
      createdBy: ctx.userId,
    },
    include: { _count: { select: { devices: true } } },
  });

  // Adopt devices already reporting under this gateway identifier. Existing
  // fleets were provisioned before Gateway was a real entity and carry only the
  // legacy `gatewayDeviceId` string; without this the relation would stay empty
  // for every device deployed before today, and the fleet view would show a
  // gateway with no devices attached to it.
  const adopted = await prisma.device.updateMany({
    where: {
      gatewayDeviceId: input.gatewayKey,
      tenantId: ctx.tenantId,
      gatewayId: null,
    },
    data: { gatewayId: row.id },
  });

  if (adopted.count > 0) {
    const refreshed = await prisma.gateway.findUniqueOrThrow({
      where: { id: row.id },
      include: { _count: { select: { devices: true } } },
    });
    return serialize(refreshed);
  }

  return serialize(row);
}

export async function updateGateway(
  ctx: AuthContext,
  id: number,
  input: UpdateGatewayInput,
) {
  const existing = await prisma.gateway.findFirst({
    where: { id, ...tenantScope(ctx) },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Gateway not found");

  const row = await prisma.gateway.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      status: input.status,
      firmwareVersion: input.firmwareVersion,
      hardwareModel: input.hardwareModel,
      projectId: input.projectId,
      structureId: input.structureId,
      locationId: input.locationId,
    },
    include: { _count: { select: { devices: true } } },
  });

  return serialize(row);
}

export async function deleteGateway(ctx: AuthContext, id: number) {
  const existing = await prisma.gateway.findFirst({
    where: { id, ...tenantScope(ctx) },
    select: { id: true, _count: { select: { devices: true } } },
  });
  if (!existing) throw new NotFoundError("Gateway not found");

  if (existing._count.devices > 0) {
    throw new BadRequestError(
      `This gateway still has ${existing._count.devices} device(s) attached. Reassign or remove them first.`,
    );
  }

  await prisma.gateway.delete({ where: { id } });
  return { status_code: 200, message: "Gateway removed" };
}

/**
 * Records a heartbeat from the field. Called by the ingest path, not by a user.
 * Matching on gatewayKey alone is safe because it is globally unique.
 */
export async function recordHeartbeat(params: {
  gatewayKey: string;
  seenAt: Date;
  firmwareVersion?: string | null;
  bufferedCount?: number | null;
}): Promise<void> {
  const gateway = await prisma.gateway.findUnique({
    where: { gatewayKey: params.gatewayKey },
    select: { id: true, status: true },
  });
  if (!gateway) return;

  await prisma.gateway.update({
    where: { id: gateway.id },
    data: {
      lastSeenAt: params.seenAt,
      firmwareVersion: params.firmwareVersion ?? undefined,
      bufferedCount: params.bufferedCount ?? undefined,
      // A gateway that reports has, by definition, finished provisioning.
      // Deliberately does not override maintenance or decommissioned, which
      // are operator decisions rather than observations.
      status:
        gateway.status === GatewayStatus.provisioning ||
        gateway.status === GatewayStatus.offline ||
        gateway.status === GatewayStatus.degraded
          ? GatewayStatus.active
          : undefined,
    },
  });
}
