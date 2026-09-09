import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/AppError";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";
import type {
  CreateLocationInput,
  CreateStructureInput,
  ListStructuresQuery,
  UpdateLocationInput,
  UpdateStructureInput,
} from "./structures.types";

/**
 * Structures and locations.
 *
 * Every query here spreads `tenantScope(ctx)`. That is the whole point of the
 * tenancy work: a caller cannot reach another tenant's rows even if they guess
 * an id, because the id is not the only predicate. `tenantScope` fails closed,
 * so a user without an active membership matches nothing rather than everything.
 */

function publicId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

/** Decimals cross the API as numbers; Prisma returns Decimal objects. */
function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

type StructureRow = Prisma.StructureGetPayload<{
  include: { project: { select: { id: true; projectName: true; uniqueId: true } } };
}>;

function serializeStructure(row: StructureRow & { _count?: { locations: number } }) {
  return {
    id: row.id,
    publicId: row.publicId,
    projectId: row.projectId,
    projectName: row.project?.projectName ?? null,
    projectUniqueId: row.project?.uniqueId ?? null,
    name: row.name,
    code: row.code,
    type: row.type,
    status: row.status,
    description: row.description,
    latitude: decimalToNumber(row.latitude),
    longitude: decimalToNumber(row.longitude),
    siteAddress: row.siteAddress,
    constructionYear: row.constructionYear,
    spanCount: row.spanCount,
    lengthMetres: decimalToNumber(row.lengthMetres),
    material: row.material,
    designStandard: row.designStandard,
    commissionedAt: row.commissionedAt,
    locationCount: row._count?.locations ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeLocation(row: Prisma.LocationGetPayload<object>) {
  return {
    id: row.id,
    publicId: row.publicId,
    structureId: row.structureId,
    name: row.name,
    code: row.code,
    description: row.description,
    stationMetres: decimalToNumber(row.stationMetres),
    elevationMetres: decimalToNumber(row.elevationMetres),
    offsetXMetres: decimalToNumber(row.offsetXMetres),
    offsetYMetres: decimalToNumber(row.offsetYMetres),
    offsetZMetres: decimalToNumber(row.offsetZMetres),
    latitude: decimalToNumber(row.latitude),
    longitude: decimalToNumber(row.longitude),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Confirms the project is visible to this caller before a structure is attached
 * to it. Without this an admin of tenant A could create a structure under
 * tenant B's project by passing its id.
 */
async function assertProjectInScope(ctx: AuthContext, projectId: number) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, isDelete: false, ...tenantScope(ctx) },
    select: { id: true },
  });
  if (!project) {
    throw new NotFoundError("Project not found");
  }
}

export async function listStructures(ctx: AuthContext, query: ListStructuresQuery) {
  const where: Prisma.StructureWhereInput = { ...tenantScope(ctx) };

  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.search) {
    // Filtered in the database, not in JavaScript: loading every row to filter
    // in memory is what makes the existing project list scale badly.
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
      { siteAddress: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.structure.count({ where }),
    prisma.structure.findMany({
      where,
      include: {
        project: { select: { id: true, projectName: true, uniqueId: true } },
        _count: { select: { locations: true } },
      },
      orderBy: [{ name: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(serializeStructure),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getStructure(ctx: AuthContext, id: number) {
  const row = await prisma.structure.findFirst({
    where: { id, ...tenantScope(ctx) },
    include: {
      project: { select: { id: true, projectName: true, uniqueId: true } },
      _count: { select: { locations: true } },
    },
  });
  // Not found and not yours are deliberately indistinguishable: a 403 would
  // confirm the row exists, which leaks the shape of another tenant's data.
  if (!row) throw new NotFoundError("Structure not found");
  return serializeStructure(row);
}

export async function createStructure(
  ctx: AuthContext,
  input: CreateStructureInput,
) {
  if (ctx.tenantId === null) {
    throw new BadRequestError("An active organization is required to add a structure");
  }
  await assertProjectInScope(ctx, input.projectId);

  const duplicate = await prisma.structure.findFirst({
    where: { tenantId: ctx.tenantId, code: input.code },
    select: { id: true },
  });
  if (duplicate) {
    throw new BadRequestError(
      `Asset code "${input.code}" is already used by another structure`,
    );
  }

  const row = await prisma.structure.create({
    data: {
      publicId: publicId("st"),
      tenantId: ctx.tenantId,
      projectId: input.projectId,
      name: input.name,
      code: input.code,
      type: input.type,
      description: input.description ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      siteAddress: input.siteAddress ?? null,
      constructionYear: input.constructionYear ?? null,
      spanCount: input.spanCount ?? null,
      lengthMetres: input.lengthMetres ?? null,
      material: input.material ?? null,
      designStandard: input.designStandard ?? null,
      commissionedAt: input.commissionedAt ? new Date(input.commissionedAt) : null,
      status: input.status,
      createdBy: ctx.userId,
    },
    include: {
      project: { select: { id: true, projectName: true, uniqueId: true } },
      _count: { select: { locations: true } },
    },
  });

  return serializeStructure(row);
}

export async function updateStructure(
  ctx: AuthContext,
  id: number,
  input: UpdateStructureInput,
) {
  const existing = await prisma.structure.findFirst({
    where: { id, ...tenantScope(ctx) },
    select: { id: true, tenantId: true },
  });
  if (!existing) throw new NotFoundError("Structure not found");

  if (input.code) {
    const clash = await prisma.structure.findFirst({
      where: { tenantId: existing.tenantId, code: input.code, id: { not: id } },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestError(
        `Asset code "${input.code}" is already used by another structure`,
      );
    }
  }

  const row = await prisma.structure.update({
    where: { id },
    data: {
      name: input.name,
      code: input.code,
      type: input.type,
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      siteAddress: input.siteAddress,
      constructionYear: input.constructionYear,
      spanCount: input.spanCount,
      lengthMetres: input.lengthMetres,
      material: input.material,
      designStandard: input.designStandard,
      commissionedAt: input.commissionedAt
        ? new Date(input.commissionedAt)
        : undefined,
      status: input.status,
    },
    include: {
      project: { select: { id: true, projectName: true, uniqueId: true } },
      _count: { select: { locations: true } },
    },
  });

  return serializeStructure(row);
}

export async function deleteStructure(ctx: AuthContext, id: number) {
  const existing = await prisma.structure.findFirst({
    where: { id, ...tenantScope(ctx) },
    select: { id: true, _count: { select: { locations: true } } },
  });
  if (!existing) throw new NotFoundError("Structure not found");

  // Deleting a structure discards its monitoring points. Refusing while
  // locations exist forces the caller to remove them deliberately rather than
  // losing the instrumentation layout to a single mis-click.
  if (existing._count.locations > 0) {
    throw new BadRequestError(
      `This structure still has ${existing._count.locations} monitoring location(s). Remove them first.`,
    );
  }

  await prisma.structure.delete({ where: { id } });
  return { status_code: 200, message: "Structure removed" };
}

// ─── Locations ───────────────────────────────────────────────────────────────

async function assertStructureInScope(ctx: AuthContext, structureId: number) {
  const structure = await prisma.structure.findFirst({
    where: { id: structureId, ...tenantScope(ctx) },
    select: { id: true, tenantId: true },
  });
  if (!structure) throw new NotFoundError("Structure not found");
  return structure;
}

export async function listLocations(ctx: AuthContext, structureId: number) {
  await assertStructureInScope(ctx, structureId);
  const rows = await prisma.location.findMany({
    where: { structureId, ...tenantScope(ctx) },
    orderBy: [{ code: "asc" }],
  });
  return rows.map(serializeLocation);
}

export async function createLocation(
  ctx: AuthContext,
  structureId: number,
  input: CreateLocationInput,
) {
  const structure = await assertStructureInScope(ctx, structureId);

  const duplicate = await prisma.location.findFirst({
    where: { structureId, code: input.code },
    select: { id: true },
  });
  if (duplicate) {
    throw new BadRequestError(
      `Point reference "${input.code}" already exists on this structure`,
    );
  }

  const row = await prisma.location.create({
    data: {
      publicId: publicId("loc"),
      tenantId: structure.tenantId,
      structureId,
      name: input.name,
      code: input.code,
      description: input.description ?? null,
      stationMetres: input.stationMetres ?? null,
      elevationMetres: input.elevationMetres ?? null,
      offsetXMetres: input.offsetXMetres ?? null,
      offsetYMetres: input.offsetYMetres ?? null,
      offsetZMetres: input.offsetZMetres ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      isActive: input.isActive ?? true,
      createdBy: ctx.userId,
    },
  });

  return serializeLocation(row);
}

export async function updateLocation(
  ctx: AuthContext,
  locationId: number,
  input: UpdateLocationInput,
) {
  const existing = await prisma.location.findFirst({
    where: { id: locationId, ...tenantScope(ctx) },
    select: { id: true, structureId: true },
  });
  if (!existing) throw new NotFoundError("Location not found");

  if (input.code) {
    const clash = await prisma.location.findFirst({
      where: {
        structureId: existing.structureId,
        code: input.code,
        id: { not: locationId },
      },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestError(
        `Point reference "${input.code}" already exists on this structure`,
      );
    }
  }

  const row = await prisma.location.update({
    where: { id: locationId },
    data: {
      name: input.name,
      code: input.code,
      description: input.description,
      stationMetres: input.stationMetres,
      elevationMetres: input.elevationMetres,
      offsetXMetres: input.offsetXMetres,
      offsetYMetres: input.offsetYMetres,
      offsetZMetres: input.offsetZMetres,
      latitude: input.latitude,
      longitude: input.longitude,
      isActive: input.isActive,
    },
  });

  return serializeLocation(row);
}

export async function deleteLocation(ctx: AuthContext, locationId: number) {
  const existing = await prisma.location.findFirst({
    where: { id: locationId, ...tenantScope(ctx) },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Location not found");

  await prisma.location.delete({ where: { id: locationId } });
  return { status_code: 200, message: "Location removed" };
}
