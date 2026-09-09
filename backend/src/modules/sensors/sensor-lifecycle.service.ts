import prisma from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/AppError";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";

/**
 * Sensor placement history and calibration history.
 *
 * Both are append-only for the same reason: they change the meaning of past
 * measurements.
 *
 *   - Placement (§16): a sensor moved from Pier P-17 to Pier P-4 in June did
 *     not retroactively record P-4 data in March. Overwriting the link would
 *     silently relabel history.
 *
 *   - Calibration (§32): reprocessing a January reading needs the coefficient
 *     that was in force in January, not today's. Editing a calibration in place
 *     destroys the ability to reproduce an earlier analysis.
 *
 * So placement is a sequence of half-open intervals and calibration is a
 * sequence of dated records. Neither is ever updated in place.
 */

async function assertSensorInScope(ctx: AuthContext, sensorId: number) {
  const sensor = await prisma.sensor.findFirst({
    where: { id: sensorId, ...tenantScope(ctx) },
    select: { id: true, tenantId: true },
  });
  if (!sensor || sensor.tenantId === null) throw new NotFoundError("Sensor not found");
  return sensor;
}

export interface AssignSensorInput {
  locationId?: number | null;
  deviceId?: number | null;
  channelNumber?: string | null;
  orientation?: string | null;
  validFrom?: string;
  notes?: string | null;
}

/**
 * Installs a sensor at a location, closing whatever placement preceded it.
 *
 * Runs in a transaction: a sensor briefly recorded in two places at once, or in
 * none, would corrupt any location resolution that ran in between.
 */
export async function assignSensor(
  ctx: AuthContext,
  sensorId: number,
  input: AssignSensorInput,
) {
  const sensor = await assertSensorInScope(ctx, sensorId);
  const validFrom = input.validFrom ? new Date(input.validFrom) : new Date();
  if (Number.isNaN(validFrom.getTime())) {
    throw new BadRequestError("validFrom is not a valid date");
  }

  if (input.locationId) {
    const location = await prisma.location.findFirst({
      where: { id: input.locationId, ...tenantScope(ctx) },
      select: { id: true },
    });
    if (!location) throw new NotFoundError("Location not found");
  }

  const open = await prisma.sensorAssignment.findFirst({
    where: { sensorId, validTo: null },
    orderBy: { validFrom: "desc" },
  });

  if (open && open.validFrom > validFrom) {
    // Allowing this would produce overlapping intervals, and a measurement
    // between them would resolve to two locations at once.
    throw new BadRequestError(
      "The new placement starts before the current one. Provide a later validFrom.",
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    if (open) {
      await tx.sensorAssignment.update({
        where: { id: open.id },
        data: { validTo: validFrom },
      });
    }
    return tx.sensorAssignment.create({
      data: {
        tenantId: sensor.tenantId!,
        sensorId,
        locationId: input.locationId ?? null,
        deviceId: input.deviceId ?? null,
        channelNumber: input.channelNumber ?? null,
        orientation: input.orientation ?? null,
        validFrom,
        notes: input.notes ?? null,
        createdBy: ctx.userId,
      },
    });
  });

  return created;
}

export async function getAssignmentHistory(ctx: AuthContext, sensorId: number) {
  await assertSensorInScope(ctx, sensorId);
  return prisma.sensorAssignment.findMany({
    where: { sensorId },
    include: {
      location: {
        select: { id: true, name: true, code: true, structureId: true },
      },
    },
    orderBy: { validFrom: "desc" },
  });
}

/**
 * Where a sensor was at a given moment (§78, §79).
 *
 * This is the function that makes historical measurements traceable: given a
 * reading's timestamp it returns the placement that was in force then, not the
 * placement in force now.
 */
export async function resolveLocationAt(
  sensorId: number,
  at: Date,
): Promise<{ locationId: number | null; assignmentId: number } | null> {
  const assignment = await prisma.sensorAssignment.findFirst({
    where: {
      sensorId,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    orderBy: { validFrom: "desc" },
    select: { id: true, locationId: true },
  });
  if (!assignment) return null;
  return { locationId: assignment.locationId, assignmentId: assignment.id };
}

export interface CalibrationInput {
  calibrationValue: string;
  zeroOffset?: string | null;
  unit?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  rangeMin?: string | null;
  rangeMax?: string | null;
  accuracy?: string | null;
  resolution?: string | null;
  certificateRef?: string | null;
  performedBy?: string | null;
  performedAt?: string;
  validUntil?: string | null;
  notes?: string | null;
}

export async function recordCalibration(
  ctx: AuthContext,
  sensorId: number,
  input: CalibrationInput,
) {
  const sensor = await assertSensorInScope(ctx, sensorId);

  const coefficient = Number(input.calibrationValue);
  if (!Number.isFinite(coefficient)) {
    throw new BadRequestError("Calibration value must be a number");
  }
  if (coefficient === 0) {
    // A zero multiplier silently flattens every reading to 0, which looks like
    // a dead structure rather than a configuration mistake.
    throw new BadRequestError(
      "A calibration coefficient of 0 would zero every reading from this sensor",
    );
  }

  const performedAt = input.performedAt ? new Date(input.performedAt) : new Date();
  if (Number.isNaN(performedAt.getTime())) {
    throw new BadRequestError("performedAt is not a valid date");
  }

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.sensorCalibration.create({
      data: {
        tenantId: sensor.tenantId!,
        sensorId,
        calibrationValue: input.calibrationValue,
        zeroOffset: input.zeroOffset ?? null,
        unit: input.unit ?? null,
        manufacturer: input.manufacturer ?? null,
        model: input.model ?? null,
        serialNumber: input.serialNumber ?? null,
        rangeMin: input.rangeMin ?? null,
        rangeMax: input.rangeMax ?? null,
        accuracy: input.accuracy ?? null,
        resolution: input.resolution ?? null,
        certificateRef: input.certificateRef ?? null,
        performedBy: input.performedBy ?? null,
        performedAt,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        notes: input.notes ?? null,
        createdBy: ctx.userId,
      },
    });

    // The sensor row carries the currently-applied coefficient so the existing
    // ingest path keeps working unchanged; the history table is the record of
    // record.
    await tx.sensor.update({
      where: { id: sensorId },
      data: { calibrationValue: input.calibrationValue },
    });

    return created;
  });

  return record;
}

export async function getCalibrationHistory(ctx: AuthContext, sensorId: number) {
  await assertSensorInScope(ctx, sensorId);
  return prisma.sensorCalibration.findMany({
    where: { sensorId },
    orderBy: { performedAt: "desc" },
  });
}

/** The calibration in force at a given instant, for reprocessing. */
export async function resolveCalibrationAt(sensorId: number, at: Date) {
  return prisma.sensorCalibration.findFirst({
    where: { sensorId, performedAt: { lte: at } },
    orderBy: { performedAt: "desc" },
  });
}
