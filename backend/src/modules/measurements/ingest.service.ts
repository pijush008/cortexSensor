import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { logger } from "../../utils/logger";
import { publishEvent } from "../stream/event-bus";
import { evaluateReadings } from "../alerts/alerts.service";
import { assessQuality } from "./quality";

/**
 * Measurement ingestion.
 *
 * Three properties this path must have, none of which the previous one did:
 *
 *   IDEMPOTENT — a gateway that retries after an outage carries the same
 *   eventId, and the insert is skipped rather than double-counted. Without it,
 *   replaying a buffered hour doubles every reading in that hour and every
 *   average computed from it.
 *
 *   BATCHED — one `createMany` per payload instead of an INSERT per reading
 *   plus a sensor lookup and a sensor-type lookup per reading. The old shape
 *   could not sustain accelerometer rates (§29).
 *
 *   TRACEABLE — location and calibration are resolved AS OF the measurement's
 *   own timestamp, so a reading keeps the placement and coefficient that were
 *   actually in force when it was taken (§16, §78, §79).
 */

export interface RawReading {
  sensorId: number;
  /** Device-reported measurement time. */
  ts: Date;
  /** Uncalibrated reading as sent by the device. */
  rawValue: number;
  /**
   * An engineering value the EDGE already computed, stored as `value` as-is
   * instead of `calibration × rawValue`.
   *
   * An Ackcio gateway applies the formula its operator configured and sends
   * both the result (`Reading`) and the transducer output (`RawReading`).
   * Re-multiplying the raw figure here would apply a second, unrelated
   * coefficient to a number that was already in microstrain. Omit for
   * hardware that sends raw readings only.
   */
  value?: number | null;
  sequenceNumber?: bigint | null;
  /** Device-generated idempotency key. */
  eventId?: string | null;
  /**
   * Quality findings the sender established itself, merged with the ones
   * assessed here. The gateway's "error" verdict on a channel becomes
   * OUT_OF_RANGE on the stored row rather than a reason to discard it.
   */
  extraFlags?: readonly string[];
}

export interface IngestContext {
  tenantId: number;
  deviceId?: number | null;
  gatewayId?: number | null;
  receivedAt?: Date;
}

export interface IngestResult {
  accepted: number;
  /** Rejected as already-seen: the idempotency guarantee doing its job. */
  duplicates: number;
  /** Readings stored carrying at least one quality flag. */
  flagged: number;
  flagCounts: Record<string, number>;
}

/** Per-sensor context, fetched once per batch rather than once per reading. */
interface SensorContext {
  sensorId: number;
  rangeMin: number | null;
  rangeMax: number | null;
  calibrationValue: number;
  calibrationId: number | null;
  calibrationValidUntil: Date | null;
  hasCalibration: boolean;
  locationId: number | null;
  structureId: number | null;
  recentValues: number[];
  latestStoredTs: Date | null;
  previousSequence: bigint | null;
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Loads everything needed to assess and place a sensor's readings, choosing the
 * calibration and placement in force at `asOf` rather than the current ones.
 */
async function loadSensorContext(
  sensorId: number,
  asOf: Date,
): Promise<SensorContext> {
  const [calibration, assignment, recent, lastSequenced] = await Promise.all([
    prisma.sensorCalibration.findFirst({
      where: { sensorId, performedAt: { lte: asOf } },
      orderBy: { performedAt: "desc" },
    }),
    prisma.sensorAssignment.findFirst({
      where: {
        sensorId,
        validFrom: { lte: asOf },
        OR: [{ validTo: null }, { validTo: { gt: asOf } }],
      },
      orderBy: { validFrom: "desc" },
      include: { location: { select: { id: true, structureId: true } } },
    }),
    prisma.measurement.findMany({
      where: { sensorId },
      orderBy: { ts: "desc" },
      take: 5,
      select: { value: true, ts: true },
    }),
    prisma.measurement.findFirst({
      where: { sensorId, sequenceNumber: { not: null } },
      orderBy: { ts: "desc" },
      select: { sequenceNumber: true },
    }),
  ]);

  // Falls back to the sensor row's own coefficient so a sensor that predates
  // formal calibration records still produces a calibrated value — flagged
  // UNCALIBRATED so the gap is visible rather than assumed away.
  const sensor = await prisma.sensor.findUnique({
    where: { id: sensorId },
    select: { calibrationValue: true },
  });

  const coefficient =
    parseNumeric(calibration?.calibrationValue) ??
    parseNumeric(sensor?.calibrationValue) ??
    1;

  return {
    sensorId,
    rangeMin: parseNumeric(calibration?.rangeMin),
    rangeMax: parseNumeric(calibration?.rangeMax),
    calibrationValue: coefficient,
    calibrationId: calibration?.id ?? null,
    calibrationValidUntil: calibration?.validUntil ?? null,
    hasCalibration: Boolean(calibration),
    locationId: assignment?.locationId ?? null,
    structureId: assignment?.location?.structureId ?? null,
    // Null values (non-finite readings) are excluded from the flatline window:
    // "not a number" repeated is a fault signature, not a flat signal.
    recentValues: recent
      .map((r) => r.value)
      .filter((v): v is number => v !== null),
    latestStoredTs: recent[0]?.ts ?? null,
    previousSequence: lastSequenced?.sequenceNumber ?? null,
  };
}

/**
 * Stores a batch of readings.
 *
 * Duplicates are handled by `skipDuplicates` against the (eventId, ts) unique
 * index rather than by a pre-flight SELECT. A check-then-insert would still
 * race two gateways replaying the same buffer simultaneously; letting the
 * database arbitrate is the only version that is actually safe.
 */
export async function ingestMeasurements(
  readings: RawReading[],
  ctx: IngestContext,
): Promise<IngestResult> {
  const result: IngestResult = {
    accepted: 0,
    duplicates: 0,
    flagged: 0,
    flagCounts: {},
  };
  if (readings.length === 0) return result;

  const receivedAt = ctx.receivedAt ?? new Date();

  // One context load per sensor per batch, not per reading.
  const sensorIds = [...new Set(readings.map((r) => r.sensorId))];
  const earliest = readings.reduce(
    (min, r) => (r.ts < min ? r.ts : min),
    readings[0].ts,
  );

  const contexts = new Map<number, SensorContext>();
  await Promise.all(
    sensorIds.map(async (id) => {
      contexts.set(id, await loadSensorContext(id, earliest));
    }),
  );

  const rows: Prisma.MeasurementCreateManyInput[] = [];

  for (const reading of readings) {
    const sensorCtx = contexts.get(reading.sensorId);
    if (!sensorCtx) continue;

    const calibrated =
      reading.value !== undefined && reading.value !== null
        ? reading.value
        : sensorCtx.calibrationValue * reading.rawValue;
    // A non-finite result is stored as a null value carrying NOT_FINITE.
    // Substituting 0 would fabricate a reading that never happened.
    const value = Number.isFinite(calibrated) ? calibrated : null;

    const assessed: string[] = assessQuality({
      value: calibrated,
      rawValue: reading.rawValue,
      ts: reading.ts,
      receivedAt,
      recentValues: sensorCtx.recentValues,
      latestStoredTs: sensorCtx.latestStoredTs,
      previousSequence: sensorCtx.previousSequence,
      sequenceNumber: reading.sequenceNumber ?? null,
      rangeMin: sensorCtx.rangeMin,
      rangeMax: sensorCtx.rangeMax,
      hasCalibration: sensorCtx.hasCalibration,
      calibrationValidUntil: sensorCtx.calibrationValidUntil,
    });
    const flags: string[] = [
      ...new Set([...assessed, ...(reading.extraFlags ?? [])]),
    ];

    for (const flag of flags) {
      result.flagCounts[flag] = (result.flagCounts[flag] ?? 0) + 1;
    }
    if (flags.length > 0) result.flagged += 1;

    rows.push({
      ts: reading.ts,
      tenantId: ctx.tenantId,
      sensorId: reading.sensorId,
      deviceId: ctx.deviceId ?? null,
      gatewayId: ctx.gatewayId ?? null,
      locationId: sensorCtx.locationId,
      structureId: sensorCtx.structureId,
      value,
      rawValue: Number.isFinite(reading.rawValue) ? reading.rawValue : null,
      calibrationId: sensorCtx.calibrationId,
      sequenceNumber: reading.sequenceNumber ?? null,
      eventId: reading.eventId ?? null,
      qualityFlags: flags,
      ingestedAt: receivedAt,
    });

    // Keep the in-batch view current so a flatline spanning one payload is
    // still detected.
    if (value !== null) sensorCtx.recentValues.unshift(value);
    sensorCtx.recentValues.length = Math.min(sensorCtx.recentValues.length, 5);
    if (reading.sequenceNumber !== null && reading.sequenceNumber !== undefined) {
      sensorCtx.previousSequence = reading.sequenceNumber;
    }
  }

  const inserted = await prisma.measurement.createMany({
    data: rows,
    skipDuplicates: true,
  });

  result.accepted = inserted.count;
  result.duplicates = rows.length - inserted.count;

  // Fan out to live subscribers. Only newly-accepted readings are published:
  // republishing a suppressed duplicate would make a dashboard show a reading
  // twice even though the database correctly stored it once.
  if (inserted.count > 0) {
    for (const row of rows) {
      publishEvent({
        type: "measurement",
        tenantId: ctx.tenantId,
        sensorId: row.sensorId,
        structureId: row.structureId ?? null,
        locationId: row.locationId ?? null,
        deviceId: row.deviceId ?? null,
        ts: (row.ts as Date).toISOString(),
        value: (row.value as number | null) ?? null,
        rawValue: (row.rawValue as number | null) ?? null,
        qualityFlags: (row.qualityFlags as string[]) ?? [],
      });
    }
  }

  // Alert evaluation runs AFTER the measurements are persisted: an alert that
  // cites a reading which failed to store is unverifiable. Failures here never
  // fail the ingest — losing a reading is worse than missing an alert, and the
  // condition will be re-evaluated on the next batch anyway.
  if (inserted.count > 0) {
    const observations = rows
      .filter((r) => (r.value as number | null) !== null)
      .map((r) => ({
        sensorId: r.sensorId as number,
        value: r.value as number,
        ts: r.ts as Date,
        qualityFlags: (r.qualityFlags as string[]) ?? [],
        locationId: (r.locationId as number | null) ?? null,
        structureId: (r.structureId as number | null) ?? null,
        deviceId: (r.deviceId as number | null) ?? null,
      }));
    await evaluateReadings(ctx.tenantId, observations).catch((err) => {
      logger.error("Alert evaluation failed", err as Error);
    });
  }

  if (result.duplicates > 0) {
    logger.info(
      `Ingest: ${result.duplicates} duplicate reading(s) suppressed by idempotency key`,
    );
  }

  return result;
}
