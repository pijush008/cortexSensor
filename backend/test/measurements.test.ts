import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { ingestMeasurements } from "../src/modules/measurements/ingest.service";
import {
  assessQuality,
  isAnalysisGrade,
  QUALITY_FLAGS,
} from "../src/modules/measurements/quality";
import { TINY_PNG } from "./fixtures/registration";

/**
 * Measurement ingestion (§12, §28, §29, §30, §78, §79).
 *
 * The load-bearing assertions:
 *   - replaying a buffered payload does NOT double-count (idempotency);
 *   - a measurement keeps the location and calibration in force when it was
 *     taken, not the ones in force now (traceability);
 *   - suspect readings are stored and flagged, never discarded.
 */

const EMAIL = "meas-admin@example.com";
const PASSWORD = "Password1!";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

let tenantId = 0;
let userId = 0;
let sensorId = 0;
let locationOne = 0;
let locationTwo = 0;
let structureId = 0;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: EMAIL },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const tenantIds = (
    await prisma.membership
      .findMany({ where: { userId: { in: ids } }, select: { tenantId: true } })
      .catch(() => [] as { tenantId: number }[])
  ).map((m) => m.tenantId);

  const wipe = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* absent on first run */
    }
  };

  await wipe(() => prisma.measurement.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.sensorAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.sensorCalibration.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.sensor.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.location.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.structure.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.project.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  await wipe(() => prisma.sensorType.deleteMany({ where: { sensorType: "MEAS-Strain" } }));
}

describe("measurement ingestion", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    await request(app).post("/api/v1/register/admin").send({
      companyName: `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Meas",
      lastName: "Admin",
      emailId: EMAIL,
      phoneNo: "1234567890",
      password: PASSWORD,
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { emailId: EMAIL } });
    userId = user.id;
    await prisma.user.update({
      where: { id: userId },
      data: { isMailVerified: "true_", isUserVerified: "true_" },
    });
    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId },
    });
    tenantId = membership.tenantId;

    const project = await prisma.project.create({
      data: {
        projectName: "Measurement Project",
        projectLocation: "Test",
        startDate: new Date("2026-01-01"),
        status: "start",
        isDelete: false,
        isRegistered: true,
        createdBy: userId,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const structure = await prisma.structure.create({
      data: {
        publicId: `st_meas_${Date.now()}`,
        tenantId,
        projectId: project.id,
        name: "Measurement Bridge",
        code: `MEAS-BR-${Date.now()}`,
        type: "bridge",
      },
    });
    structureId = structure.id;

    const mkLoc = async (code: string) =>
      prisma.location.create({
        data: {
          publicId: `loc_meas_${code}_${Date.now()}`,
          tenantId,
          structureId,
          name: code,
          code,
        },
      });
    locationOne = (await mkLoc("M-P17")).id;
    locationTwo = (await mkLoc("M-P04")).id;

    const sensorType = await prisma.sensorType.create({
      data: {
        sensorType: "MEAS-Strain",
        sensorIcon: "s.png",
        calibrationValue: "1",
        status: "one",
      },
    });
    const sensor = await prisma.sensor.create({
      data: {
        sensorName: `MEAS-SG-${Date.now()}`,
        sensorTypeID: sensorType.id,
        tenantId,
        assignedAdmin: userId,
        calibrationValue: "2",
        unit: "uS",
        status: "one",
      },
    });
    sensorId = sensor.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ── Idempotency (§12) ──────────────────────────────────────────────────────

  test("replaying a buffered payload does not double-count", async () => {
    const batch = Array.from({ length: 5 }, (_, i) => ({
      sensorId,
      ts: new Date(`2026-03-01T00:0${i}:00.000Z`),
      rawValue: 10 + i,
      eventId: `replay-${i}`,
      sequenceNumber: BigInt(i + 1),
    }));

    const first = await ingestMeasurements(batch, { tenantId });
    expect(first.accepted).toBe(5);
    expect(first.duplicates).toBe(0);

    // The gateway did not get an acknowledgement and replays the same buffer.
    const second = await ingestMeasurements(batch, { tenantId });
    expect(second.accepted).toBe(0);
    expect(second.duplicates).toBe(5);

    const stored = await prisma.measurement.count({ where: { sensorId } });
    expect(stored).toBe(5);
  });

  test("a partially-acknowledged replay stores only the missing readings", async () => {
    const overlapping = [
      { sensorId, ts: new Date("2026-03-01T00:04:00.000Z"), rawValue: 14, eventId: "replay-4" },
      { sensorId, ts: new Date("2026-03-01T00:05:00.000Z"), rawValue: 15, eventId: "replay-5" },
      { sensorId, ts: new Date("2026-03-01T00:06:00.000Z"), rawValue: 16, eventId: "replay-6" },
    ];
    const result = await ingestMeasurements(overlapping, { tenantId });
    expect(result.accepted).toBe(2);
    expect(result.duplicates).toBe(1);
  });

  test("readings without an event id are still accepted", async () => {
    // Legacy hardware sends none. It simply gets no dedup protection rather
    // than being rejected.
    const result = await ingestMeasurements(
      [
        { sensorId, ts: new Date("2026-03-02T00:00:00.000Z"), rawValue: 1 },
        { sensorId, ts: new Date("2026-03-02T00:00:00.000Z"), rawValue: 1 },
      ],
      { tenantId },
    );
    expect(result.accepted).toBe(2);
  });

  // ── Calibration is applied and recorded ────────────────────────────────────

  test("the stored value is calibrated and the raw reading is preserved", async () => {
    await ingestMeasurements(
      [
        {
          sensorId,
          ts: new Date("2026-03-03T00:00:00.000Z"),
          rawValue: 100,
          eventId: "calib-1",
        },
      ],
      { tenantId },
    );

    const row = await prisma.measurement.findFirstOrThrow({
      where: { eventId: "calib-1" },
    });
    // Sensor coefficient is 2, so 100 raw becomes 200 calibrated.
    expect(row.value).toBe(200);
    // Both are kept, so a recalibration can be reapplied to history.
    expect(row.rawValue).toBe(100);
  });

  // ── Traceability (§78, §79) ────────────────────────────────────────────────

  test("a measurement keeps the location it was taken at, even after the sensor moves", async () => {
    await prisma.sensorAssignment.create({
      data: {
        tenantId,
        sensorId,
        locationId: locationOne,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
    await prisma.sensorAssignment.create({
      data: {
        tenantId,
        sensorId,
        locationId: locationTwo,
        validFrom: new Date("2026-06-01T00:00:00.000Z"),
      },
    });

    await ingestMeasurements(
      [
        {
          sensorId,
          ts: new Date("2026-04-01T00:00:00.000Z"),
          rawValue: 5,
          eventId: "trace-before-move",
        },
      ],
      { tenantId },
    );
    await ingestMeasurements(
      [
        {
          sensorId,
          ts: new Date("2026-07-01T00:00:00.000Z"),
          rawValue: 5,
          eventId: "trace-after-move",
        },
      ],
      { tenantId },
    );

    const before = await prisma.measurement.findFirstOrThrow({
      where: { eventId: "trace-before-move" },
    });
    const after = await prisma.measurement.findFirstOrThrow({
      where: { eventId: "trace-after-move" },
    });

    expect(before.locationId).toBe(locationOne);
    expect(after.locationId).toBe(locationTwo);
    // And both resolve back up the hierarchy to the structure (§78).
    expect(before.structureId).toBe(structureId);
    expect(after.structureId).toBe(structureId);
  });

  // ── Quality flags (§30) ────────────────────────────────────────────────────

  test("suspect readings are stored WITH flags, never discarded", async () => {
    const result = await ingestMeasurements(
      [
        {
          sensorId,
          ts: new Date("2026-08-01T00:00:00.000Z"),
          rawValue: Number.POSITIVE_INFINITY,
          eventId: "quality-notfinite",
        },
      ],
      { tenantId },
    );
    // Accepted, not rejected: a discarded reading is a gap nobody can explain.
    expect(result.accepted).toBe(1);

    const row = await prisma.measurement.findFirstOrThrow({
      where: { eventId: "quality-notfinite" },
    });
    expect(row.qualityFlags).toContain(QUALITY_FLAGS.NOT_FINITE);
  });

  test("a sequence gap is detected and flagged", () => {
    const flags = assessQuality({
      value: 1,
      rawValue: 1,
      ts: new Date(),
      receivedAt: new Date(),
      recentValues: [],
      latestStoredTs: null,
      previousSequence: 10n,
      sequenceNumber: 15n,
      rangeMin: null,
      rangeMax: null,
      hasCalibration: true,
      calibrationValidUntil: null,
    });
    expect(flags).toContain(QUALITY_FLAGS.SEQUENCE_GAP);
  });

  test("a flatlined channel is flagged", () => {
    const flags = assessQuality({
      value: 42,
      rawValue: 42,
      ts: new Date(),
      receivedAt: new Date(),
      recentValues: [42, 42, 42, 42, 42],
      latestStoredTs: new Date(Date.now() - 1000),
      previousSequence: null,
      sequenceNumber: null,
      rangeMin: null,
      rangeMax: null,
      hasCalibration: true,
      calibrationValidUntil: null,
    });
    expect(flags).toContain(QUALITY_FLAGS.FLATLINE);
  });

  test("an out-of-range reading is flagged, and saturation is distinguished", () => {
    const outOfRange = assessQuality({
      value: 5000,
      rawValue: 5000,
      ts: new Date(),
      receivedAt: new Date(),
      recentValues: [],
      latestStoredTs: null,
      previousSequence: null,
      sequenceNumber: null,
      rangeMin: 0,
      rangeMax: 1000,
      hasCalibration: true,
      calibrationValidUntil: null,
    });
    expect(outOfRange).toContain(QUALITY_FLAGS.OUT_OF_RANGE);

    const saturated = assessQuality({
      value: 1000,
      rawValue: 1000,
      ts: new Date(),
      receivedAt: new Date(),
      recentValues: [],
      latestStoredTs: null,
      previousSequence: null,
      sequenceNumber: null,
      rangeMin: 0,
      rangeMax: 1000,
      hasCalibration: true,
      calibrationValidUntil: null,
    });
    expect(saturated).toContain(QUALITY_FLAGS.SATURATED);
    expect(saturated).not.toContain(QUALITY_FLAGS.OUT_OF_RANGE);
  });

  test("a device clock running ahead is flagged, not silently corrected", () => {
    const flags = assessQuality({
      value: 1,
      rawValue: 1,
      ts: new Date(Date.now() + 10 * 60 * 1000),
      receivedAt: new Date(),
      recentValues: [],
      latestStoredTs: null,
      previousSequence: null,
      sequenceNumber: null,
      rangeMin: null,
      rangeMax: null,
      hasCalibration: true,
      calibrationValidUntil: null,
    });
    // Rewriting the device's own timestamp would destroy the evidence of the
    // clock fault.
    expect(flags).toContain(QUALITY_FLAGS.FUTURE_TIMESTAMP);
  });

  test("replayed data is recognised by its delivery lag", () => {
    const flags = assessQuality({
      value: 1,
      rawValue: 1,
      ts: new Date(Date.now() - 6 * 60 * 60 * 1000),
      receivedAt: new Date(),
      recentValues: [],
      latestStoredTs: null,
      previousSequence: null,
      sequenceNumber: null,
      rangeMin: null,
      rangeMax: null,
      hasCalibration: true,
      calibrationValidUntil: null,
    });
    expect(flags).toContain(QUALITY_FLAGS.DELAYED_DELIVERY);
  });

  test("an uncalibrated reading is flagged rather than assumed correct", () => {
    const flags = assessQuality({
      value: 1,
      rawValue: 1,
      ts: new Date(),
      receivedAt: new Date(),
      recentValues: [],
      latestStoredTs: null,
      previousSequence: null,
      sequenceNumber: null,
      rangeMin: null,
      rangeMax: null,
      hasCalibration: false,
      calibrationValidUntil: null,
    });
    expect(flags).toContain(QUALITY_FLAGS.UNCALIBRATED);
  });

  test("only numerically untrustworthy readings are excluded from statistics", () => {
    expect(isAnalysisGrade([])).toBe(true);

    // Timing flags describe WHEN a reading arrived, not whether it is correct.
    // Buffered data replayed after an outage is a valid measurement.
    expect(isAnalysisGrade([QUALITY_FLAGS.DELAYED_DELIVERY])).toBe(true);
    expect(isAnalysisGrade([QUALITY_FLAGS.OUT_OF_ORDER])).toBe(true);

    // Traceability flags are an administrative gap, not a numeric one. An
    // earlier version excluded these too, which would have blanked the chart
    // for every sensor whose calibration certificate is not yet on file —
    // hiding data the operator actually has. They are counted separately so
    // the series can be marked without being suppressed.
    expect(isAnalysisGrade([QUALITY_FLAGS.UNCALIBRATED])).toBe(true);
    expect(isAnalysisGrade([QUALITY_FLAGS.STALE_CALIBRATION])).toBe(true);

    // These mean the number itself cannot be trusted.
    expect(isAnalysisGrade([QUALITY_FLAGS.FLATLINE])).toBe(false);
    expect(isAnalysisGrade([QUALITY_FLAGS.NOT_FINITE])).toBe(false);
    expect(isAnalysisGrade([QUALITY_FLAGS.OUT_OF_RANGE])).toBe(false);
  });

  // ── Storage ────────────────────────────────────────────────────────────────

  test("measurements are stored in a TimescaleDB hypertable", async () => {
    const rows = await prisma.$queryRaw<{ hypertable_name: string }[]>`
      SELECT hypertable_name FROM timescaledb_information.hypertables
      WHERE hypertable_name = 'measurements'
    `;
    // The conversion the previous init script could never achieve, because
    // measurements is keyed on (ts, id) rather than (id) alone.
    expect(rows).toHaveLength(1);
  });
});
