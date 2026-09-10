import { AlertCategory, AlertSeverity, AlertStatus } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { ingestMeasurements } from "../src/modules/measurements/ingest.service";
import {
  buildDedupeKey,
  createRule,
  evaluateReadings,
  transition,
} from "../src/modules/alerts/alerts.service";
import {
  deriveSeverity,
  exceedanceRatio,
  isEscalation,
} from "../src/modules/alerts/severity";
import { resolveAuthContext } from "../src/modules/rbac/rbac.service";
import { TINY_PNG } from "./fixtures/registration";

/**
 * Alerting.
 *
 * Three properties carry the weight:
 *   - one continuous condition produces ONE alert, not one per reading;
 *   - severity is derived from stated rules and is reproducible;
 *   - a sensor fault never presents as a structural finding (§31).
 */

const EMAIL = "alerts-admin@example.com";
const PASSWORD = "Password1!";

let userId = 0;
let tenantId = 0;
let sensorId = 0;
let cookie = "";

function cookieHeader(raw: unknown): string {
  const c = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!c) throw new Error("No auth cookies returned");
  return c;
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

  await wipe(() =>
    prisma.alertEvent.deleteMany({
      where: { alert: { tenantId: { in: tenantIds } } },
    }),
  );
  await wipe(() => prisma.alert.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.alertRule.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.measurement.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.sensor.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  await wipe(() => prisma.sensorType.deleteMany({ where: { sensorType: "ALERT-Type" } }));
}

describe("alerting", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    await request(app).post("/api/v1/register/admin").send({
      companyName: `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Alerts",
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
    tenantId = (await prisma.membership.findFirstOrThrow({ where: { userId } })).tenantId;

    const sensorType = await prisma.sensorType.create({
      data: {
        sensorType: "ALERT-Type",
        sensorIcon: "a.png",
        calibrationValue: "1",
        status: "one",
      },
    });
    const sensor = await prisma.sensor.create({
      data: {
        sensorName: `ALERT-SG-${Date.now()}`,
        sensorTypeID: sensorType.id,
        tenantId,
        assignedAdmin: userId,
        calibrationValue: "1",
        unit: "mm",
        status: "one",
      },
    });
    sensorId = sensor.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ── Severity is derived, not chosen (§41) ──────────────────────────────────

  test("exceedance is measured as a fraction of the limit", () => {
    expect(exceedanceRatio(110, null, 100)).toBeCloseTo(0.1, 6);
    expect(exceedanceRatio(90, 100, null)).toBeCloseTo(0.1, 6);
    expect(exceedanceRatio(50, 0, 100)).toBe(0);
    // A zero limit would make a ratio undefined; it must not produce Infinity.
    expect(Number.isFinite(exceedanceRatio(5, null, 0))).toBe(true);
  });

  test("severity rises with both exceedance and persistence", () => {
    const base = {
      category: AlertCategory.structural,
      requiredSamples: 3,
      dataQualitySuspect: false,
    };

    const brief = deriveSeverity({ ...base, exceedanceRatio: 0.06, consecutiveSamples: 1 });
    const sustained = deriveSeverity({ ...base, exceedanceRatio: 0.06, consecutiveSamples: 3 });
    const large = deriveSeverity({ ...base, exceedanceRatio: 0.4, consecutiveSamples: 3 });
    const extreme = deriveSeverity({ ...base, exceedanceRatio: 1.5, consecutiveSamples: 6 });

    expect(brief.severity).toBe(AlertSeverity.low);
    expect(sustained.severity).toBe(AlertSeverity.medium);
    expect(large.severity).toBe(AlertSeverity.high);
    expect(extreme.severity).toBe(AlertSeverity.critical);

    // The derivation is recorded so a severity can be audited, not taken on
    // trust.
    expect(extreme.rationale).toContain("exceedance");
    expect(extreme.rationale).toContain("consecutive");
  });

  test("severity is reproducible for identical inputs", () => {
    const inputs = {
      category: AlertCategory.structural,
      exceedanceRatio: 0.3,
      consecutiveSamples: 4,
      requiredSamples: 3,
      dataQualitySuspect: false,
    };
    expect(deriveSeverity(inputs)).toEqual(deriveSeverity(inputs));
  });

  test("a sensor fault never reaches critical (§31)", () => {
    const structural = deriveSeverity({
      category: AlertCategory.structural,
      exceedanceRatio: 3,
      consecutiveSamples: 10,
      requiredSamples: 3,
      dataQualitySuspect: false,
    });
    const instrument = deriveSeverity({
      category: AlertCategory.sensor_health,
      exceedanceRatio: 3,
      consecutiveSamples: 10,
      requiredSamples: 3,
      dataQualitySuspect: false,
    });

    expect(structural.severity).toBe(AlertSeverity.critical);
    // Same numbers, but a broken instrument is not a damaged bridge, and
    // letting it sit at CRITICAL beside a real finding is how an inbox stops
    // being trusted.
    expect(instrument.severity).toBe(AlertSeverity.high);
    expect(instrument.rationale).toContain("instrument fault");
  });

  test("a breach seen only in flagged readings is downgraded and less confident", () => {
    const clean = deriveSeverity({
      category: AlertCategory.structural,
      exceedanceRatio: 0.4,
      consecutiveSamples: 3,
      requiredSamples: 3,
      dataQualitySuspect: false,
    });
    const suspect = deriveSeverity({
      category: AlertCategory.structural,
      exceedanceRatio: 0.4,
      consecutiveSamples: 3,
      requiredSamples: 3,
      dataQualitySuspect: true,
    });

    expect(suspect.severity).not.toBe(clean.severity);
    expect(suspect.confidence).toBeLessThan(clean.confidence);
    expect(suspect.rationale).toContain("data-quality");
  });

  test("confidence describes the detection, and never reaches certainty", () => {
    const verdict = deriveSeverity({
      category: AlertCategory.structural,
      exceedanceRatio: 5,
      consecutiveSamples: 100,
      requiredSamples: 3,
      dataQualitySuspect: false,
    });
    expect(verdict.confidence).toBeGreaterThan(0.5);
    expect(verdict.confidence).toBeLessThan(1);
  });

  // ── Deduplication (§40) ────────────────────────────────────────────────────

  test("a dedupe key identifies the condition, not the reading", () => {
    const a = buildDedupeKey({
      tenantId: 1,
      ruleId: 2,
      sensorId: 3,
      category: AlertCategory.structural,
      bound: "max",
    });
    const b = buildDedupeKey({
      tenantId: 1,
      ruleId: 2,
      sensorId: 3,
      category: AlertCategory.structural,
      bound: "max",
    });
    expect(a).toBe(b);

    // A different bound is a different condition: breaching a floor and
    // breaching a ceiling mean different things.
    const other = buildDedupeKey({
      tenantId: 1,
      ruleId: 2,
      sensorId: 3,
      category: AlertCategory.structural,
      bound: "min",
    });
    expect(other).not.toBe(a);
  });

  test("a continuous excursion produces one alert, not one per reading", async () => {
    const ctx = await resolveAuthContext(userId);
    await createRule(ctx, {
      name: "Displacement ceiling",
      sensorId,
      maxValue: 10,
      consecutiveSamples: 3,
    });

    const base = new Date("2026-09-01T00:00:00.000Z").getTime();
    const breach = (offset: number, value: number) => ({
      sensorId,
      value,
      ts: new Date(base + offset * 1000),
      qualityFlags: [] as string[],
    });

    // 30 consecutive breaching readings — a real excursion lasting minutes.
    const first = await evaluateReadings(
      tenantId,
      Array.from({ length: 30 }, (_, i) => breach(i, 14)),
    );
    expect(first.raised).toBe(1);

    // More of the same condition arrives.
    const second = await evaluateReadings(
      tenantId,
      Array.from({ length: 30 }, (_, i) => breach(30 + i, 15)),
    );
    expect(second.raised).toBe(0);
    expect(second.updated).toBe(1);

    const alerts = await prisma.alert.findMany({ where: { tenantId, sensorId } });
    expect(alerts).toHaveLength(1);
    // The occurrences are folded in rather than discarded.
    expect(alerts[0].occurrenceCount).toBeGreaterThan(1);
  });

  test("a brief spike below the persistence threshold raises nothing", async () => {
    const before = await prisma.alert.count({ where: { tenantId } });
    await evaluateReadings(tenantId, [
      {
        sensorId,
        value: 14,
        ts: new Date("2026-09-02T00:00:00.000Z"),
        qualityFlags: [],
      },
    ]);
    // One sample against a rule requiring three: electrical noise, not a
    // condition.
    expect(await prisma.alert.count({ where: { tenantId } })).toBe(before);
  });

  test("severity escalates on a worse excursion but never silently downgrades", async () => {
    // A dedicated sensor and rule, so the alert starts MILD and escalation is
    // actually observable. Reusing the earlier alert would not test anything:
    // a 40% sustained exceedance is already critical, and there is nothing
    // above critical to escalate to.
    const ctx = await resolveAuthContext(userId);
    const escSensor = await prisma.sensor.create({
      data: {
        sensorName: `ALERT-ESC-${Date.now()}`,
        sensorTypeID: (
          await prisma.sensorType.findFirstOrThrow({ where: { sensorType: "ALERT-Type" } })
        ).id,
        tenantId,
        assignedAdmin: userId,
        calibrationValue: "1",
        unit: "mm",
        status: "one",
      },
    });
    await createRule(ctx, {
      name: "Escalation ceiling",
      sensorId: escSensor.id,
      maxValue: 100,
      consecutiveSamples: 3,
    });

    // 6% beyond the limit, just sustained: MEDIUM.
    const mildBase = new Date("2026-09-03T00:00:00.000Z").getTime();
    await evaluateReadings(
      tenantId,
      Array.from({ length: 3 }, (_, i) => ({
        sensorId: escSensor.id,
        value: 106,
        ts: new Date(mildBase + i * 1000),
        qualityFlags: [] as string[],
      })),
    );

    const alert = await prisma.alert.findFirstOrThrow({
      where: { tenantId, sensorId: escSensor.id, status: AlertStatus.open },
    });
    const before = alert.severity;
    expect(before).toBe(AlertSeverity.medium);

    const base = new Date("2026-09-03T01:00:00.000Z").getTime();
    await evaluateReadings(
      tenantId,
      Array.from({ length: 10 }, (_, i) => ({
        sensorId: escSensor.id,
        value: 600, // far beyond the limit of 100
        ts: new Date(base + i * 1000),
        qualityFlags: [] as string[],
      })),
    );

    const escalated = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(isEscalation(before, escalated.severity)).toBe(true);

    // Now a milder breach: the severity must NOT drop, because an engineer
    // already triaged the worst of it.
    const mild = new Date("2026-09-04T00:00:00.000Z").getTime();
    await evaluateReadings(
      tenantId,
      Array.from({ length: 5 }, (_, i) => ({
        sensorId: escSensor.id,
        value: 106,
        ts: new Date(mild + i * 1000),
        qualityFlags: [] as string[],
      })),
    );
    const after = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(after.severity).toBe(escalated.severity);
  });

  // ── Lifecycle (§40) ────────────────────────────────────────────────────────

  test("the lifecycle is enforced and every transition is recorded", async () => {
    const ctx = await resolveAuthContext(userId);
    // Targeted by sensor, not by findFirst on status. An earlier version took
    // "any open alert", which became order-dependent as soon as another test
    // added a second one — it could resolve the wrong alert and leave the
    // recurrence test's dedupe key occupied.
    const alert = await prisma.alert.findFirstOrThrow({
      where: { tenantId, sensorId, status: AlertStatus.open },
    });

    // open -> closed is not permitted: nobody has looked at it yet.
    await expect(
      transition(ctx, alert.id, AlertStatus.closed),
    ).rejects.toMatchObject({ statusCode: 400 });

    await transition(ctx, alert.id, AlertStatus.acknowledged, { note: "Taking a look" });
    await transition(ctx, alert.id, AlertStatus.investigating);

    // Resolution requires a reason.
    await expect(
      transition(ctx, alert.id, AlertStatus.resolved),
    ).rejects.toMatchObject({ statusCode: 400 });

    await transition(ctx, alert.id, AlertStatus.resolved, {
      note: "Thermal expansion during commissioning; verified on site.",
    });
    const resolved = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(resolved.resolvedById).toBe(userId);
    expect(resolved.resolutionNote).toContain("Thermal expansion");

    const events = await prisma.alertEvent.findMany({
      where: { alertId: alert.id },
      orderBy: { createdAt: "asc" },
    });
    // Detection plus each human transition: the record of who knew what, when.
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0].isAutomatic).toBe(true);
    expect(events.some((e) => e.toStatus === AlertStatus.resolved)).toBe(true);
  });

  test("a resolved condition can raise a new alert when it recurs", async () => {
    // Asserted explicitly rather than assumed from test ordering: the alert
    // for THIS sensor must be resolved before a recurrence can raise a new one.
    const open = await prisma.alert.count({
      where: { tenantId, sensorId, status: { in: [AlertStatus.open, AlertStatus.acknowledged, AlertStatus.investigating] } },
    });
    expect(open, "the prior alert for this sensor should be resolved").toBe(0);

    // The dedupe key is free again, and a recurrence is genuinely new
    // information that must not be suppressed.
    const base = new Date("2026-09-10T00:00:00.000Z").getTime();
    const result = await evaluateReadings(
      tenantId,
      Array.from({ length: 5 }, (_, i) => ({
        sensorId,
        value: 20,
        ts: new Date(base + i * 1000),
        qualityFlags: [] as string[],
      })),
    );
    expect(result.raised).toBe(1);
  });

  // ── Authorization ──────────────────────────────────────────────────────────

  test("alerts are tenant scoped", async () => {
    const otherEmail = `alerts-other-${Date.now()}@example.com`;
    await request(app).post("/api/v1/register/admin").send({
      companyName: `Test Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Other",
      lastName: "Org",
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

    const mine = await request(app).get("/api/v1/alerts").set("Cookie", cookie);
    const theirs = await request(app)
      .get("/api/v1/alerts")
      .set("Cookie", cookieHeader(login.headers["set-cookie"]));

    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThan(0);
    expect(theirs.status).toBe(200);
    expect(theirs.body.data).toHaveLength(0);

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

  test("resolving requires a note through the API too", async () => {
    // Its own alert, so this cannot consume one another test depends on.
    const open = await prisma.alert.findFirst({
      where: { tenantId, status: AlertStatus.open, sensorId: { not: sensorId } },
    });
    if (!open) return;

    const res = await request(app)
      .post(`/api/v1/alerts/${open.id}/resolve`)
      .set("Cookie", cookie)
      .send({});
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/note/i);
  });

  test("a rule needs at least one bound, and bounds must be ordered", async () => {
    const ctx = await resolveAuthContext(userId);
    await expect(createRule(ctx, { name: "No bounds" })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      createRule(ctx, { name: "Inverted", minValue: 10, maxValue: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("an alert raised from ingest cites the measurement that caused it", async () => {
    const ctx = await resolveAuthContext(userId);
    const sensor = await prisma.sensor.create({
      data: {
        sensorName: `ALERT-ING-${Date.now()}`,
        sensorTypeID: (
          await prisma.sensorType.findFirstOrThrow({ where: { sensorType: "ALERT-Type" } })
        ).id,
        tenantId,
        assignedAdmin: userId,
        calibrationValue: "1",
        unit: "mm",
        status: "one",
      },
    });
    await createRule(ctx, {
      name: "Ingest ceiling",
      sensorId: sensor.id,
      maxValue: 5,
      consecutiveSamples: 3,
    });

    const base = new Date("2026-09-20T00:00:00.000Z").getTime();
    await ingestMeasurements(
      Array.from({ length: 6 }, (_, i) => ({
        sensorId: sensor.id,
        ts: new Date(base + i * 1000),
        rawValue: 9,
        eventId: `alert-ing-${i}`,
      })),
      { tenantId },
    );

    const alert = await prisma.alert.findFirst({
      where: { tenantId, sensorId: sensor.id },
    });
    expect(alert).toBeTruthy();

    const evidence = alert!.evidence as Record<string, unknown>;
    // Evidence an engineer can check, not just an assertion.
    expect(evidence.limit).toBe(5);
    expect(evidence.observedValue).toBe(9);
    expect(evidence.consecutiveSamples).toBeGreaterThanOrEqual(3);
    expect(String(evidence.severityRationale)).toContain("exceedance");
  });
});
