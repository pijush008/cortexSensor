import { randomBytes } from "crypto";
import { InspectionOutcome, InspectionType, Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/AppError";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";

/**
 * Field inspections (§53).
 *
 * This closes the loop from a detected condition to what a person actually
 * found on site. Without it an alert can be resolved with a note, but the
 * finding itself is never recorded anywhere durable and the next engineer has
 * no way to learn what the last one saw.
 */

function publicId(): string {
  return `insp_${randomBytes(12).toString("hex")}`;
}

export interface CreateInspectionInput {
  structureId: number;
  locationId?: number;
  alertId?: number;
  type?: InspectionType;
  outcome?: InspectionOutcome;
  performedAt?: string;
  inspectorName: string;
  inspectorOrg?: string;
  observations: string;
  recommendation?: string;
  environmentalContext?: Record<string, unknown>;
}

export async function createInspection(
  ctx: AuthContext,
  input: CreateInspectionInput,
) {
  if (ctx.tenantId === null) {
    throw new BadRequestError("An active organization is required");
  }

  const structure = await prisma.structure.findFirst({
    where: { id: input.structureId, ...tenantScope(ctx) },
    select: { id: true },
  });
  if (!structure) throw new NotFoundError("Structure not found");

  if (input.locationId) {
    const location = await prisma.location.findFirst({
      where: {
        id: input.locationId,
        structureId: input.structureId,
        ...tenantScope(ctx),
      },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundError("Location not found on this structure");
    }
  }

  if (input.alertId) {
    // Resolved through the same tenant scope as everything else: linking to
    // another tenant's alert would leak its existence.
    const alert = await prisma.alert.findFirst({
      where: { id: input.alertId, ...tenantScope(ctx) },
      select: { id: true },
    });
    if (!alert) throw new NotFoundError("Alert not found");
  }

  const performedAt = input.performedAt ? new Date(input.performedAt) : new Date();
  if (Number.isNaN(performedAt.getTime())) {
    throw new BadRequestError("performedAt is not a valid date");
  }
  // A future-dated inspection is a data-entry error, and it would silently
  // fall outside every report period that ought to contain it.
  if (performedAt.getTime() > Date.now() + 60_000) {
    throw new BadRequestError("An inspection cannot be dated in the future");
  }

  return prisma.inspection.create({
    data: {
      publicId: publicId(),
      tenantId: ctx.tenantId,
      structureId: input.structureId,
      locationId: input.locationId ?? null,
      alertId: input.alertId ?? null,
      type: input.type ?? InspectionType.routine,
      outcome: input.outcome ?? InspectionOutcome.monitor,
      performedAt,
      inspectorName: input.inspectorName,
      inspectorOrg: input.inspectorOrg ?? null,
      observations: input.observations,
      recommendation: input.recommendation ?? null,
      environmentalContext:
        (input.environmentalContext as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      createdBy: ctx.userId,
    },
  });
}

export async function listInspections(
  ctx: AuthContext,
  filters: { structureId?: number; alertId?: number } = {},
) {
  return prisma.inspection.findMany({
    where: {
      ...tenantScope(ctx),
      ...(filters.structureId ? { structureId: filters.structureId } : {}),
      ...(filters.alertId ? { alertId: filters.alertId } : {}),
    },
    include: { photos: true },
    orderBy: { performedAt: "desc" },
    take: 200,
  });
}

export async function getInspection(ctx: AuthContext, id: number) {
  const inspection = await prisma.inspection.findFirst({
    where: { id, ...tenantScope(ctx) },
    include: { photos: true },
  });
  if (!inspection) throw new NotFoundError("Inspection not found");
  return inspection;
}

export async function recordResolution(
  ctx: AuthContext,
  id: number,
  note: string,
) {
  const inspection = await getInspection(ctx, id);
  if (!note.trim()) {
    throw new BadRequestError("A resolution note is required");
  }
  return prisma.inspection.update({
    where: { id: inspection.id },
    data: { resolutionNote: note.trim(), resolvedAt: new Date() },
  });
}
