import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { ingestMeasurements } from "../src/modules/measurements/ingest.service";
import {
  generateReport,
  requestReport,
  type ReportContent,
} from "../src/modules/reports/report-generator.service";
import { createInspection } from "../src/modules/inspections/inspections.service";
import { listAuditLog } from "../src/modules/audit/audit.service";
import { resolveAuthContext } from "../src/modules/rbac/rbac.service";

/**
 * Reports, inspections and the audit viewer.
 *
 * The assertion that matters most is a negative one: a generated report must
 * never assert that a structure is safe. It is a document someone may act on
 * or file with an authority, which makes an unsupported conclusion there far
 * more consequential than the same words on a screen (§52, §88).
 */

const EMAIL = "reports-admin@example.com";
const PASSWORD = "Password1!";

let userId = 0;
let tenantId = 0;
let structureId = 0;
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

  await wipe(() => prisma.report.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() =>
    prisma.inspectionPhoto.deleteMany({ where: { tenantId: { in: tenantIds } } }),
  );
  await wipe(() => prisma.inspection.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() =>
    prisma.alertEvent.deleteMany({ where: { alert: { tenantId: { in: tenantIds } } } }),
  );
  await wipe(() => prisma.alert.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.alertRule.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.measurement.deleteMany({ where: { tenantId: { in: tenantIds } } }));
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
  await wipe(() => prisma.sensorType.deleteMany({ where: { sensorType: "REPORT-Type" } }));
}

describe("reports, inspections and audit", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    await request(app).post("/api/v1/register/admin").send({
      firstName: "Reports",
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

    const project = await prisma.project.create({
      data: {
        projectName: "Report Project",
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
        publicId: `st_rep_${Date.now()}`,
        tenantId,
        projectId: project.id,
        name: "Report Bridge",
        code: `REP-BR-${Date.now()}`,
        type: "bridge",
      },
    });
    structureId = structure.id;

    const location = await prisma.location.create({
      data: {
        publicId: `loc_rep_${Date.now()}`,
        tenantId,
        structureId,
        name: "Pier P-3",
        code: "P3",
      },
    });

    const sensorType = await prisma.sensorType.create({
      data: {
        sensorType: "REPORT-Type",
        sensorIcon: "r.png",
        calibrationValue: "1",
        status: "one",
      },
    });
    const sensor = await prisma.sensor.create({
      data: {
        sensorName: `REP-SG-${Date.now()}`,
        sensorTypeID: sensorType.id,
        tenantId,
        assignedAdmin: userId,
        calibrationValue: "1",
        unit: "mm",
        status: "one",
      },
    });
    sensorId = sensor.id;

    await prisma.sensorAssignment.create({
      data: {
        tenantId,
        sensorId,
        locationId: location.id,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    // A day of readings across the report period.
    // Deliberately in the PAST relative to the test clock: inspections refuse
    // a future date, and a report period that has not happened yet is not a
    // meaningful thing to generate.
    const base = new Date("2026-08-01T00:00:00.000Z").getTime();
    await ingestMeasurements(
      Array.from({ length: 200 }, (_, i) => ({
        sensorId,
        ts: new Date(base + i * 60_000),
        rawValue: 5 + Math.sin(i / 10),
        eventId: `rep-${i}`,
      })),
      { tenantId },
    );
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ── The constraint that matters (§52, §88) ─────────────────────────────────

  test("a generated report never asserts that the structure is safe", async () => {
    const ctx = await resolveAuthContext(userId);
    const report = await requestReport(ctx, {
      title: "August monitoring",
      structureId,
      periodFrom: new Date("2026-08-01T00:00:00.000Z"),
      periodTo: new Date("2026-08-01T06:00:00.000Z"),
    });
    await generateReport(report.id);

    const done = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(done.status, String(done.error)).toBe("ready");

    const content = done.content as unknown as ReportContent;
    const serialized = JSON.stringify(content).toLowerCase();

    // No safety verdict, in any of its usual phrasings.
    expect(serialized).not.toContain("structure is safe");
    expect(serialized).not.toContain("safe for use");
    expect(serialized).not.toContain("no damage");
    expect(serialized).not.toContain("structurally sound");
    expect(serialized).not.toContain("fit for purpose");

    // And it says so explicitly.
    const limits = content.limitations.join(" ").toLowerCase();
    expect(limits).toContain("does not assess structural safety");
  });

  test("the report records what was measured, with provenance", async () => {
    const ctx = await resolveAuthContext(userId);
    const report = await requestReport(ctx, {
      title: "Provenance check",
      structureId,
      periodFrom: new Date("2026-08-01T00:00:00.000Z"),
      periodTo: new Date("2026-08-01T06:00:00.000Z"),
    });
    await generateReport(report.id);

    const done = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    const content = done.content as unknown as ReportContent;

    expect(content.structure?.name).toBe("Report Bridge");
    expect(content.monitoring.measurementCount).toBeGreaterThan(0);
    expect(content.sensors.length).toBeGreaterThan(0);
    expect(content.sensors[0].unit).toBe("mm");
    // Reproducible: the generator version is on the document.
    expect(content.meta.generatorVersion).toBeTruthy();
    expect(content.meta.periodFrom).toBe("2026-08-01T00:00:00.000Z");
  });

  test("a period with no data produces a report that says so", async () => {
    const ctx = await resolveAuthContext(userId);
    const report = await requestReport(ctx, {
      title: "Empty period",
      structureId,
      periodFrom: new Date("2020-01-01T00:00:00.000Z"),
      periodTo: new Date("2020-01-02T00:00:00.000Z"),
    });
    await generateReport(report.id);

    const done = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    const content = done.content as unknown as ReportContent;

    expect(content.monitoring.measurementCount).toBe(0);
    // Documents the absence rather than rendering an empty document that looks
    // like a clean bill of health.
    expect(content.limitations[0].toLowerCase()).toContain("no measurements were recorded");
  });

  test("partial coverage is disclosed rather than presented as full", async () => {
    const ctx = await resolveAuthContext(userId);
    // A month requested, but data exists for only part of one day.
    const report = await requestReport(ctx, {
      title: "Sparse month",
      structureId,
      periodFrom: new Date("2026-08-01T00:00:00.000Z"),
      periodTo: new Date("2026-08-30T00:00:00.000Z"),
    });
    await generateReport(report.id);

    const done = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    const content = done.content as unknown as ReportContent;

    expect(content.monitoring.coverageGapRatio).toBeGreaterThan(0.1);
    expect(content.limitations.join(" ").toLowerCase()).toContain(
      "cover only part of the requested period",
    );
  });

  test("reports are versioned, so regenerating never overwrites one already read", async () => {
    const ctx = await resolveAuthContext(userId);
    const args = {
      title: "Versioned",
      structureId,
      periodFrom: new Date("2026-08-02T00:00:00.000Z"),
      periodTo: new Date("2026-08-03T00:00:00.000Z"),
    };
    const first = await requestReport(ctx, args);
    const second = await requestReport(ctx, args);

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.id).not.toBe(first.id);
  });

  test("an inverted period is rejected", async () => {
    const ctx = await resolveAuthContext(userId);
    await expect(
      requestReport(ctx, {
        title: "Backwards",
        structureId,
        periodFrom: new Date("2026-12-01"),
        periodTo: new Date("2026-08-01"),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── Inspections (§53) ──────────────────────────────────────────────────────

  test("an inspection records observation and recommendation separately", async () => {
    const ctx = await resolveAuthContext(userId);
    const inspection = await createInspection(ctx, {
      structureId,
      inspectorName: "R. Mehta",
      inspectorOrg: "Third-party NDT",
      observations: "Hairline cracking observed on the north bearing shelf.",
      recommendation: "Re-inspect in 3 months; monitor displacement trend.",
      outcome: "monitor",
    });

    // Kept apart so a later reader can tell what was SEEN from what was
    // CONCLUDED.
    expect(inspection.observations).toContain("Hairline cracking");
    expect(inspection.recommendation).toContain("Re-inspect");
    expect(inspection.publicId).toMatch(/^insp_/);
  });

  test("an inspection can be linked to the alert that prompted it", async () => {
    const ctx = await resolveAuthContext(userId);
    const alert = await prisma.alert.create({
      data: {
        publicId: `al_rep_${Date.now()}`,
        tenantId,
        sensorId,
        structureId,
        category: "structural",
        severity: "high",
        status: "open",
        title: "Displacement above limit",
        evidence: {},
        dedupeKey: `t${tenantId}:rep:test`,
        detectedAt: new Date("2026-08-01T02:00:00.000Z"),
        lastObservedAt: new Date("2026-08-01T02:00:00.000Z"),
      },
    });

    const inspection = await createInspection(ctx, {
      structureId,
      alertId: alert.id,
      type: "triggered",
      inspectorName: "R. Mehta",
      observations: "Attended site; bearing free, no visible distress.",
      outcome: "no_action_required",
    });
    expect(inspection.alertId).toBe(alert.id);
  });

  test("a future-dated inspection is refused", async () => {
    const ctx = await resolveAuthContext(userId);
    await expect(
      createInspection(ctx, {
        structureId,
        inspectorName: "Time Traveller",
        observations: "Nothing yet.",
        performedAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("an inspection cannot attach to another tenant's structure", async () => {
    const otherEmail = `reports-other-${Date.now()}@example.com`;
    await request(app).post("/api/v1/register/admin").send({
      firstName: "Other",
      lastName: "Org",
      emailId: otherEmail,
      phoneNo: "1234567890",
      password: PASSWORD,
    });
    const other = await prisma.user.findUniqueOrThrow({ where: { emailId: otherEmail } });
    const otherCtx = await resolveAuthContext(other.id);

    await expect(
      createInspection(otherCtx, {
        structureId,
        inspectorName: "Intruder",
        observations: "Should not be possible.",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

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

  test("inspections in the period appear in the report", async () => {
    const ctx = await resolveAuthContext(userId);
    await createInspection(ctx, {
      structureId,
      inspectorName: "In-period inspector",
      observations: "Routine visual check, nothing of note.",
      performedAt: "2026-08-01T03:00:00.000Z",
    });

    const report = await requestReport(ctx, {
      title: "With inspection",
      structureId,
      periodFrom: new Date("2026-08-01T00:00:00.000Z"),
      periodTo: new Date("2026-08-01T06:00:00.000Z"),
    });
    await generateReport(report.id);

    const done = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    const content = done.content as unknown as ReportContent;
    expect(
      content.inspections.some((i) => i.inspectorName === "In-period inspector"),
    ).toBe(true);
  });

  // ── Audit viewer (§60) ─────────────────────────────────────────────────────

  test("the audit log returns this organization's own activity", async () => {
    // Driven through the API, because that is what writes an audit row with an
    // actor. Calling the service directly bypasses the controller that records
    // it — and registration itself produces an UNATTRIBUTED row (there is no
    // authenticated actor yet), which tenant scoping deliberately excludes.
    await request(app)
      .post("/api/v1/inspections")
      .set("Cookie", cookie)
      .send({
        structureId,
        inspectorName: "Audited inspector",
        observations: "Recorded through the API so the action is audited.",
      })
      .expect(201);

    const ctx = await resolveAuthContext(userId);
    const { items } = await listAuditLog(ctx, { limit: 50 });
    expect(items.length).toBeGreaterThan(0);
    // Every row is attributable, and attributable to a member of this tenant.
    for (const entry of items) {
      expect(entry.actor).not.toBeNull();
      expect(entry.actor!.id).toBe(userId);
    }
  });

  test("the audit log never shows another organization's activity", async () => {
    const otherEmail = `audit-other-${Date.now()}@example.com`;
    await request(app).post("/api/v1/register/admin").send({
      firstName: "Audit",
      lastName: "Other",
      emailId: otherEmail,
      phoneNo: "1234567890",
      password: PASSWORD,
    });
    const other = await prisma.user.findUniqueOrThrow({ where: { emailId: otherEmail } });
    const otherCtx = await resolveAuthContext(other.id);

    const { items } = await listAuditLog(otherCtx, { limit: 100 });
    expect(items.every((i) => i.actor?.id !== userId)).toBe(true);

    const tenantIds = (
      await prisma.membership.findMany({
        where: { userId: other.id },
        select: { tenantId: true },
      })
    ).map((m) => m.tenantId);
    await prisma.refreshToken.deleteMany({ where: { userId: other.id } }).catch(() => {});
    await prisma.subscription.deleteMany({ where: { adminId: other.id } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId: other.id } }).catch(() => {});
    await prisma.membership.deleteMany({ where: { userId: other.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: other.id } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }).catch(() => {});
  });

  test("audit pagination is cursor based and stable", async () => {
    const ctx = await resolveAuthContext(userId);
    const first = await listAuditLog(ctx, { limit: 2 });
    expect(first.items.length).toBeLessThanOrEqual(2);

    if (first.nextCursor) {
      const second = await listAuditLog(ctx, { limit: 2, cursor: first.nextCursor });
      const firstIds = first.items.map((i) => i.id);
      // No overlap: a growing log would shift an offset-based page.
      expect(second.items.every((i) => !firstIds.includes(i.id))).toBe(true);
    }
  });

  test("the audit endpoints are permission guarded", async () => {
    await request(app).get("/api/v1/audit").expect(401);
    const ok = await request(app).get("/api/v1/audit").set("Cookie", cookie);
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.items)).toBe(true);
  });

  test("report and inspection endpoints require authentication", async () => {
    await request(app).get("/api/v1/reports/generated").expect(401);
    await request(app).get("/api/v1/inspections").expect(401);
    await request(app).post("/api/v1/inspections").send({}).expect(401);
  });
});
