import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { ingestMeasurements } from "../src/modules/measurements/ingest.service";
import {
  createBaselineFromRun,
  executeRun,
  inferSampleRate,
  loadSamples,
  requestSpectrum,
} from "../src/modules/analysis/analysis.service";
import { resolveAuthContext } from "../src/modules/rbac/rbac.service";
import { TINY_PNG } from "./fixtures/registration";

/**
 * Spectral analysis.
 *
 * The decisive test is not "does it return numbers" but "does it return the
 * RIGHT numbers": a synthetic signal of known frequency must come back at that
 * frequency. Anything else is a plausible-looking result, which is precisely
 * what this product must never produce.
 *
 * These tests require the Python engine. When it is unreachable they fail
 * rather than being skipped silently — a green suite that quietly stopped
 * testing the analysis would be worse than a red one.
 */

const EMAIL = "analysis-admin@example.com";
const PASSWORD = "Password1!";
const ENGINE = process.env.SHM_ENGINE_URL || "http://localhost:8000";

let userId = 0;
let tenantId = 0;
let sensorId = 0;
let engineUp = false;

/** 200 Hz sampling, two tones at 12.5 Hz and 31 Hz. */
const SAMPLE_RATE = 200;
const TONE_A = 12.5;
const TONE_B = 31;

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

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

  await wipe(() => prisma.analysisRun.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.baseline.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.measurement.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.sensor.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  await wipe(() => prisma.sensorType.deleteMany({ where: { sensorType: "ANALYSIS-Acc" } }));
}

describe("spectral analysis", () => {
  let cookie = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    try {
      const res = await fetch(`${ENGINE}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      engineUp = res.ok;
    } catch {
      engineUp = false;
    }

    await request(app).post("/api/v1/register/admin").send({
      companyName: `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Analysis",
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
    const login = await request(app)
      .post("/api/v1/commonLogin")
      .send({ username: EMAIL, password: PASSWORD });
    cookie = cookieHeader(login.headers["set-cookie"]);

    tenantId = (
      await prisma.membership.findFirstOrThrow({ where: { userId } })
    ).tenantId;

    const sensorType = await prisma.sensorType.create({
      data: {
        sensorType: "ANALYSIS-Acc",
        sensorIcon: "a.png",
        calibrationValue: "1",
        status: "one",
      },
    });
    const sensor = await prisma.sensor.create({
      data: {
        sensorName: `ANALYSIS-ACC-${Date.now()}`,
        sensorTypeID: sensorType.id,
        tenantId,
        assignedAdmin: userId,
        calibrationValue: "1",
        unit: "m/s2",
        status: "one",
      },
    });
    sensorId = sensor.id;

    // 40 seconds of a known two-tone signal, sampled evenly at 200 Hz.
    const base = new Date("2026-07-01T00:00:00.000Z").getTime();
    const total = SAMPLE_RATE * 40;
    const readings = Array.from({ length: total }, (_, i) => {
      const t = i / SAMPLE_RATE;
      return {
        sensorId,
        ts: new Date(base + i * (1000 / SAMPLE_RATE)),
        rawValue:
          Math.sin(2 * Math.PI * TONE_A * t) +
          0.6 * Math.sin(2 * Math.PI * TONE_B * t),
        eventId: `an-${i}`,
      };
    });

    // Chunked to keep any single insert well within parameter limits.
    for (let i = 0; i < readings.length; i += 2000) {
      await ingestMeasurements(readings.slice(i, i + 2000), { tenantId });
    }
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("the analysis engine is reachable", () => {
    // Asserted rather than skipped: a suite that quietly stops testing the
    // analysis is worse than one that fails.
    expect(
      engineUp,
      `SHM engine unreachable at ${ENGINE}. Start it with: docker compose up -d python-shm`,
    ).toBe(true);
  });

  test("sampling rate is inferred from timestamps, resisting a dropped packet", () => {
    const base = Date.now();
    const even = Array.from({ length: 50 }, (_, i) => new Date(base + i * 5));
    expect(inferSampleRate(even).sampleRateHz).toBeCloseTo(200, 3);

    // One long gap must not drag the estimate: the median ignores it where a
    // mean would not.
    const withGap = [...even];
    withGap[25] = new Date(withGap[24].getTime() + 5000);
    for (let i = 26; i < withGap.length; i++) {
      withGap[i] = new Date(withGap[i - 1].getTime() + 5);
    }
    expect(inferSampleRate(withGap).sampleRateHz).toBeCloseTo(200, 1);
  });

  test("only numerically trustworthy samples are loaded for a transform", async () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const to = new Date("2026-07-01T00:00:40.000Z");
    const { values, timestamps } = await loadSamples(sensorId, tenantId, from, to);
    expect(values.length).toBeGreaterThan(1000);
    expect(values.length).toBe(timestamps.length);
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
  });

  test("a known two-tone signal returns its true frequencies", async () => {
    expect(engineUp).toBe(true);
    const ctx = await resolveAuthContext(userId);

    const run = await requestSpectrum(ctx, {
      sensorId,
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-01T00:00:40.000Z"),
    });
    await executeRun(run.id);

    const finished = await prisma.analysisRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(finished.status, String(finished.error)).toBe("succeeded");

    const result = finished.result as unknown as {
      peaks: { frequency_hz: number }[];
      frequency_resolution_hz: number;
      limitations: string[];
    };

    const tolerance = result.frequency_resolution_hz * 3;
    const found = result.peaks.map((p) => p.frequency_hz);

    // The assertion that matters: the analysis recovers the real frequencies.
    expect(
      found.some((f) => Math.abs(f - TONE_A) < tolerance),
      `expected ~${TONE_A} Hz in ${JSON.stringify(found)}`,
    ).toBe(true);
    expect(
      found.some((f) => Math.abs(f - TONE_B) < tolerance),
      `expected ~${TONE_B} Hz in ${JSON.stringify(found)}`,
    ).toBe(true);

    // Provenance: sample rate, method and engine version are recorded so the
    // number can be reproduced later (§103).
    expect(finished.sampleRateHz).toBeCloseTo(SAMPLE_RATE, 0);
    expect(finished.method).toBe("welch-psd+peak-picking");
    expect(finished.engineVersion).toBeTruthy();
    expect(result.limitations.length).toBeGreaterThan(0);
  }, 120_000);

  test("a window with too little data fails loudly instead of returning a spectrum", async () => {
    const ctx = await resolveAuthContext(userId);
    const run = await requestSpectrum(ctx, {
      sensorId,
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-01T00:00:01.000Z"),
    });
    await executeRun(run.id);

    const finished = await prisma.analysisRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(finished.status).toBe("failed");
    // The reason survives, so a recurring failure is diagnosable.
    expect(finished.error).toMatch(/not enough usable measurements/i);
  });

  test("a baseline captures the reference state and comparison reports a shift", async () => {
    expect(engineUp).toBe(true);
    const ctx = await resolveAuthContext(userId);

    const first = await requestSpectrum(ctx, {
      sensorId,
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-01T00:00:40.000Z"),
    });
    await executeRun(first.id);

    const baseline = await createBaselineFromRun(ctx, first.id, {
      label: "Commissioning reference",
    });
    expect(baseline.version).toBe(1);
    expect(baseline.engineVersion).toBeTruthy();
    // Captured FROM a run so reference and comparison share method and
    // parameters; a Hann baseline compared against a boxcar run would produce
    // shifts that are artefacts of the method.
    expect(baseline.method).toBe("welch-psd+peak-picking");

    const second = await requestSpectrum(ctx, {
      sensorId,
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-01T00:00:40.000Z"),
      baselineId: baseline.id,
    });
    await executeRun(second.id);

    const finished = await prisma.analysisRun.findUniqueOrThrow({
      where: { id: second.id },
    });
    const result = finished.result as unknown as {
      baselineComparison: {
        matched: { shift_hz: number; exceeds_resolution: boolean }[];
        interpretation: string;
      };
    };

    expect(result.baselineComparison).toBeTruthy();
    expect(result.baselineComparison.matched.length).toBeGreaterThan(0);
    // Same window against its own baseline: no real shift.
    for (const match of result.baselineComparison.matched) {
      expect(Math.abs(match.shift_hz)).toBeLessThan(1e-6);
      expect(match.exceeds_resolution).toBe(false);
    }
    // And the result refuses to diagnose (§88).
    expect(result.baselineComparison.interpretation.toLowerCase()).toContain(
      "not diagnosed",
    );
  }, 120_000);

  test("a baseline cannot be captured from an unfinished analysis", async () => {
    const ctx = await resolveAuthContext(userId);
    const run = await requestSpectrum(ctx, {
      sensorId,
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-01T00:00:40.000Z"),
    });
    await expect(
      createBaselineFromRun(ctx, run.id, { label: "premature" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── Authorization ──────────────────────────────────────────────────────────

  test("requesting analysis requires SHM_ANALYZE", async () => {
    const res = await request(app)
      .post("/api/v1/analysis/spectrum")
      .send({ sensorId, from: "2026-07-01", to: "2026-07-02" });
    expect(res.status).toBe(401);
  });

  test("the endpoint says plainly when work was queued", async () => {
    const res = await request(app)
      .post("/api/v1/analysis/spectrum")
      .set("Cookie", cookie)
      .send({
        sensorId,
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-01T00:00:40.000Z",
      });

    expect(res.status).toBe(202);
    // 202, not 200: the work has been accepted, not completed. And `queued`
    // reports the truth, so a disabled queue cannot look like success.
    expect(res.body).toHaveProperty("queued");
    expect(res.body.data.status).toBe("queued");
  });

  test("another tenant cannot request analysis on a foreign sensor", async () => {
    const otherEmail = `analysis-other-${Date.now()}@example.com`;
    await request(app).post("/api/v1/register/admin").send({
      companyName: `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Other",
      lastName: "Tenant",
      emailId: otherEmail,
      phoneNo: "1234567890",
      password: PASSWORD,
    });
    const other = await prisma.user.findUniqueOrThrow({
      where: { emailId: otherEmail },
    });
    await prisma.user.update({
      where: { id: other.id },
      data: { isMailVerified: "true_", isUserVerified: "true_" },
    });
    const login = await request(app)
      .post("/api/v1/commonLogin")
      .send({ username: otherEmail, password: PASSWORD });

    const res = await request(app)
      .post("/api/v1/analysis/spectrum")
      .set("Cookie", cookieHeader(login.headers["set-cookie"]))
      .send({
        sensorId,
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-01T00:00:40.000Z",
      });
    expect(res.status).toBe(404);

    const tenantIds = (
      await prisma.membership.findMany({
        where: { userId: other.id },
        select: { tenantId: true },
      })
    ).map((m) => m.tenantId);
    await prisma.refreshToken.deleteMany({ where: { userId: other.id } }).catch(() => {});
    await prisma.subscription.deleteMany({ where: { adminId: other.id } }).catch(() => {});
    await prisma.membership.deleteMany({ where: { userId: other.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: other.id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }).catch(() => {});
  });
});
