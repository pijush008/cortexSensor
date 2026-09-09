import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import {
  publishEvent,
  subscribeTenant,
  type StreamEvent,
} from "../src/modules/stream/event-bus";
import {
  BUCKET_SECONDS,
  chooseBucket,
  getSeries,
} from "../src/modules/measurements/history.service";
import { ingestMeasurements } from "../src/modules/measurements/ingest.service";
import { resolveAuthContext } from "../src/modules/rbac/rbac.service";

/**
 * Live streaming and history.
 *
 * The security property under test is the one that made SEC-1 critical: a
 * tenant's live events must reach that tenant and no other. Previously the
 * browser held a shared broker credential and subscribed to a cross-tenant
 * wildcard, so this property did not hold at all.
 */

const EMAIL_A = "stream-a@example.com";
const EMAIL_B = "stream-b@example.com";
const PASSWORD = "Password1!";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function registerAndLogin(email: string) {
  await request(app).post("/api/v1/register/admin").send({
    firstName: "Stream",
    lastName: "Test",
    emailId: email,
    phoneNo: "1234567890",
    password: PASSWORD,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { emailId: email } });
  await prisma.user.update({
    where: { id: user.id },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });
  const login = await request(app)
    .post("/api/v1/commonLogin")
    .send({ username: email, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  const membership = await prisma.membership.findFirstOrThrow({
    where: { userId: user.id },
  });
  return {
    userId: user.id,
    tenantId: membership.tenantId,
    cookie: cookieHeader(login.headers["set-cookie"]),
  };
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: [EMAIL_A, EMAIL_B] } },
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
  await wipe(() => prisma.sensor.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.project.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  await wipe(() => prisma.sensorType.deleteMany({ where: { sensorType: "STREAM-Type" } }));
}

describe("live stream and history", () => {
  let adminA: Awaited<ReturnType<typeof registerAndLogin>>;
  let adminB: Awaited<ReturnType<typeof registerAndLogin>>;
  let sensorA = 0;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    adminA = await registerAndLogin(EMAIL_A);
    adminB = await registerAndLogin(EMAIL_B);

    const sensorType = await prisma.sensorType.create({
      data: {
        sensorType: "STREAM-Type",
        sensorIcon: "s.png",
        calibrationValue: "1",
        status: "one",
      },
    });
    const sensor = await prisma.sensor.create({
      data: {
        sensorName: `STREAM-SG-${Date.now()}`,
        sensorTypeID: sensorType.id,
        tenantId: adminA.tenantId,
        assignedAdmin: adminA.userId,
        calibrationValue: "1",
        unit: "uS",
        status: "one",
      },
    });
    sensorA = sensor.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ── Tenant isolation on the bus (SEC-1) ────────────────────────────────────

  test("an event published for one tenant never reaches another", async () => {
    const receivedByA: StreamEvent[] = [];
    const receivedByB: StreamEvent[] = [];

    const offA = subscribeTenant(adminA.tenantId, (e) => receivedByA.push(e));
    const offB = subscribeTenant(adminB.tenantId, (e) => receivedByB.push(e));

    try {
      publishEvent({
        type: "measurement",
        tenantId: adminA.tenantId,
        sensorId: sensorA,
        structureId: null,
        locationId: null,
        deviceId: null,
        ts: new Date().toISOString(),
        value: 42,
        rawValue: 42,
        qualityFlags: [],
      });

      expect(receivedByA).toHaveLength(1);
      // The property that SEC-1 violated: tenant B must see nothing.
      expect(receivedByB).toHaveLength(0);
    } finally {
      offA();
      offB();
    }
  });

  test("unsubscribing stops delivery, so a closed connection cannot leak", () => {
    const received: StreamEvent[] = [];
    const off = subscribeTenant(adminA.tenantId, (e) => received.push(e));
    off();

    publishEvent({
      type: "measurement",
      tenantId: adminA.tenantId,
      sensorId: sensorA,
      structureId: null,
      locationId: null,
      deviceId: null,
      ts: new Date().toISOString(),
      value: 1,
      rawValue: 1,
      qualityFlags: [],
    });

    expect(received).toHaveLength(0);
  });

  test("ingesting a measurement publishes it to that tenant only", async () => {
    const forA: StreamEvent[] = [];
    const forB: StreamEvent[] = [];
    const offA = subscribeTenant(adminA.tenantId, (e) => forA.push(e));
    const offB = subscribeTenant(adminB.tenantId, (e) => forB.push(e));

    try {
      await ingestMeasurements(
        [
          {
            sensorId: sensorA,
            ts: new Date("2026-05-01T00:00:00.000Z"),
            rawValue: 7,
            eventId: "stream-publish-1",
          },
        ],
        { tenantId: adminA.tenantId },
      );

      expect(forA.length).toBeGreaterThan(0);
      expect(forB).toHaveLength(0);
    } finally {
      offA();
      offB();
    }
  });

  test("a suppressed duplicate is not republished to dashboards", async () => {
    const batch = [
      {
        sensorId: sensorA,
        ts: new Date("2026-05-02T00:00:00.000Z"),
        rawValue: 9,
        eventId: "stream-dupe-1",
      },
    ];
    await ingestMeasurements(batch, { tenantId: adminA.tenantId });

    const received: StreamEvent[] = [];
    const off = subscribeTenant(adminA.tenantId, (e) => received.push(e));
    try {
      const replay = await ingestMeasurements(batch, { tenantId: adminA.tenantId });
      expect(replay.duplicates).toBe(1);
      // Republishing would make a dashboard show the reading twice even though
      // the database correctly stored it once.
      expect(received).toHaveLength(0);
    } finally {
      off();
    }
  });

  // ── SSE endpoint guards ────────────────────────────────────────────────────

  test("the stream requires authentication", async () => {
    const res = await request(app).get("/api/v1/stream/measurements");
    expect(res.status).toBe(401);
  });

  test("the stream opens for an authenticated tenant member", async () => {
    // Asserted at the socket level: supertest buffers a response until it ends,
    // and an SSE stream deliberately never does.
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    try {
      const controller = new AbortController();
      const res = await fetch(
        `http://127.0.0.1:${port}/api/v1/stream/measurements`,
        {
          headers: { Cookie: adminA.cookie, Accept: "text/event-stream" },
          signal: controller.signal,
        },
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      // Proxy buffering would hold events until the response ended — i.e. never.
      expect(res.headers.get("x-accel-buffering")).toBe("no");

      // The stream announces itself before any measurement arrives, so the
      // client can distinguish "connected, idle" from "never connected".
      const reader = res.body!.getReader();
      const chunk = await reader.read();
      const text = new TextDecoder().decode(chunk.value);
      expect(text).toContain("event: ready");

      controller.abort();
      await reader.cancel().catch(() => {});
    } finally {
      server.close();
    }
  });

  // ── History aggregation (§29, §51) ─────────────────────────────────────────

  test("bucket size is chosen to keep a series renderable", () => {
    const hour = 60 * 60 * 1000;
    // An hour at 1s resolution is 3600 points — under the cap, so keep it fine.
    expect(BUCKET_SECONDS[chooseBucket(0, hour)]).toBeLessThanOrEqual(10);
    // A year cannot be drawn at second resolution; a coarser bucket is chosen
    // rather than returning millions of points to the browser.
    const year = 365 * 24 * hour;
    expect(BUCKET_SECONDS[chooseBucket(0, year)]).toBeGreaterThanOrEqual(3600);
  });

  test("a series is aggregated per bucket with min, max and counts", async () => {
    const base = new Date("2026-06-01T00:00:00.000Z").getTime();
    await ingestMeasurements(
      [
        { sensorId: sensorA, ts: new Date(base), rawValue: 10, eventId: "s1" },
        { sensorId: sensorA, ts: new Date(base + 1000), rawValue: 20, eventId: "s2" },
        { sensorId: sensorA, ts: new Date(base + 2000), rawValue: 30, eventId: "s3" },
      ],
      { tenantId: adminA.tenantId },
    );

    const ctx = await resolveAuthContext(adminA.userId);
    const series = await getSeries(ctx, {
      sensorId: sensorA,
      from: new Date(base - 60_000),
      to: new Date(base + 60_000),
      bucket: "1h",
    });

    expect(series.unit).toBe("uS");
    expect(series.points.length).toBeGreaterThan(0);
    const bucket = series.points[0];
    // min and max preserve the peaks an average erases — and in structural
    // monitoring the peak is the event.
    expect(bucket.min).toBe(10);
    expect(bucket.max).toBe(30);
    expect(bucket.avg).toBeCloseTo(20, 5);
    expect(bucket.count).toBeGreaterThanOrEqual(3);
  });

  test("another tenant cannot read a series for a foreign sensor", async () => {
    const ctxB = await resolveAuthContext(adminB.userId);
    await expect(
      getSeries(ctxB, {
        sensorId: sensorA,
        from: new Date("2026-01-01"),
        to: new Date("2026-12-31"),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("an inverted range is rejected rather than returning nothing", async () => {
    const ctx = await resolveAuthContext(adminA.userId);
    await expect(
      getSeries(ctx, {
        sensorId: sensorA,
        from: new Date("2026-12-31"),
        to: new Date("2026-01-01"),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("the series endpoint is permission-guarded", async () => {
    const res = await request(app).get(
      `/api/v1/measurements/series?sensorId=${sensorA}&from=2026-01-01`,
    );
    expect(res.status).toBe(401);
  });
});
