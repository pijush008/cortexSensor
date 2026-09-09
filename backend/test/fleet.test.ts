import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import {
  authenticateDeviceKey,
  issueCredential,
  parseDeviceKey,
} from "../src/modules/devices/device-credentials.service";
import {
  connectivityOf,
  recordHeartbeat,
} from "../src/modules/gateways/gateways.service";
import { resolveLocationAt } from "../src/modules/sensors/sensor-lifecycle.service";

/**
 * Gateways, device credentials, and sensor placement/calibration history.
 *
 * The two assertions that carry the most weight:
 *   - a device credential is revocable and scoped to one device (SEC-4);
 *   - a sensor that moves does NOT rewrite where its earlier readings were
 *     taken (§16, §79), because that would silently relabel history.
 */

const EMAIL_A = "fleet-admin-a@example.com";
const EMAIL_B = "fleet-admin-b@example.com";
const PASSWORD = "Password1!";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function registerAndLogin(email: string) {
  await request(app).post("/api/v1/register/admin").send({
    firstName: "Fleet",
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

  await wipe(() =>
    prisma.sensorAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } }),
  );
  await wipe(() =>
    prisma.sensorCalibration.deleteMany({ where: { tenantId: { in: tenantIds } } }),
  );
  await wipe(() =>
    prisma.deviceCredential.deleteMany({ where: { tenantId: { in: tenantIds } } }),
  );
  await wipe(() => prisma.device.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.gateway.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.sensor.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.location.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.structure.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.project.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() =>
    prisma.invoice.deleteMany({ where: { subscription: { adminId: { in: ids } } } }),
  );
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
  await wipe(() => prisma.sensorType.deleteMany({ where: { sensorType: "FLEET-Strain" } }));
  await wipe(() => prisma.deviceType.deleteMany({ where: { deviceType: "FLEET-Node" } }));
}

describe("gateways, device credentials and sensor history", () => {
  let adminA: Awaited<ReturnType<typeof registerAndLogin>>;
  let adminB: Awaited<ReturnType<typeof registerAndLogin>>;
  let gatewayIdA = 0;
  let deviceIdA = 0;
  let sensorIdA = 0;
  let locationOne = 0;
  let locationTwo = 0;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    adminA = await registerAndLogin(EMAIL_A);
    adminB = await registerAndLogin(EMAIL_B);

    const project = await prisma.project.create({
      data: {
        projectName: "Fleet Project A",
        projectLocation: "Test",
        startDate: new Date("2026-01-01"),
        status: "start",
        isDelete: false,
        isRegistered: true,
        createdBy: adminA.userId,
        tenantId: adminA.tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const structure = await prisma.structure.create({
      data: {
        publicId: `st_fleet_${Date.now()}`,
        tenantId: adminA.tenantId,
        projectId: project.id,
        name: "Fleet Bridge",
        code: "FLEET-BR-1",
        type: "bridge",
      },
    });
    const mkLocation = async (code: string, name: string) =>
      prisma.location.create({
        data: {
          publicId: `loc_${code}_${Date.now()}`,
          tenantId: adminA.tenantId,
          structureId: structure.id,
          name,
          code,
        },
      });
    locationOne = (await mkLocation("P17-NB", "Pier P-17 / North Bearing")).id;
    locationTwo = (await mkLocation("P04-SB", "Pier P-4 / South Bearing")).id;

    const deviceType = await prisma.deviceType.create({
      data: { deviceType: "FLEET-Node", status: "one" },
    });
    const device = await prisma.device.create({
      data: {
        deviceName: "Fleet Device A",
        deviceType: deviceType.id,
        channelCount: 2,
        deviceId: "fleet-dev-a",
        gatewayDeviceId: "gw-fleet-a",
        addedBy: adminA.userId,
        assignedAdmin: adminA.userId,
        tenantId: adminA.tenantId,
        deviceStartDate: new Date(),
        createdAt: new Date(),
        status: "one",
        isDelete: "false_",
      },
    });
    deviceIdA = device.id;

    const sensorType = await prisma.sensorType.create({
      data: {
        sensorType: "FLEET-Strain",
        sensorIcon: "s.png",
        calibrationValue: "1",
        status: "one",
      },
    });
    const sensor = await prisma.sensor.create({
      data: {
        sensorName: "FLEET-SG-001",
        sensorTypeID: sensorType.id,
        assignedAdmin: adminA.userId,
        tenantId: adminA.tenantId,
        calibrationValue: "1",
        unit: "uS",
        status: "one",
      },
    });
    sensorIdA = sensor.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ── Gateways ───────────────────────────────────────────────────────────────

  test("a gateway can be registered and is tenant-scoped", async () => {
    const res = await request(app)
      .post("/api/v1/gateways")
      .set("Cookie", adminA.cookie)
      .send({
        gatewayKey: "gw-fleet-a",
        name: "Bridge A Gateway",
        hardwareModel: "Raspberry Pi 4B",
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.status).toBe("provisioning");
    // Never reported yet — stated as such, not rendered as "offline 0s ago".
    expect(res.body.data.lastSeenAt).toBeNull();
    expect(res.body.data.connectivity).toBe("never_reported");
    expect(res.body.data.bufferedCount).toBeNull();
    gatewayIdA = res.body.data.id;

    const foreign = await request(app)
      .get(`/api/v1/gateways/${gatewayIdA}`)
      .set("Cookie", adminB.cookie);
    expect(foreign.status).toBe(404);
  });

  test("gateway identifiers are globally unique across tenants", async () => {
    // Two tenants sharing a gatewayKey would route one customer's telemetry
    // into the other's account, since ingest resolves by this key alone.
    const clash = await request(app)
      .post("/api/v1/gateways")
      .set("Cookie", adminB.cookie)
      .send({ gatewayKey: "gw-fleet-a", name: "Colliding gateway" });
    expect(clash.status).toBe(400);
  });

  test("connectivity is derived from the last heartbeat, not stored", () => {
    expect(connectivityOf(null).state).toBe("never_reported");
    expect(connectivityOf(new Date()).state).toBe("online");
    expect(connectivityOf(new Date(Date.now() - 120_000)).state).toBe("stale");
    expect(connectivityOf(new Date(Date.now() - 600_000)).state).toBe("offline");
  });

  test("a heartbeat moves a provisioning gateway to active", async () => {
    await recordHeartbeat({ gatewayKey: "gw-fleet-a", seenAt: new Date() });
    const res = await request(app)
      .get(`/api/v1/gateways/${gatewayIdA}`)
      .set("Cookie", adminA.cookie);
    expect(res.body.data.status).toBe("active");
    expect(res.body.data.connectivity).toBe("online");
  });

  test("a heartbeat does not override an operator's maintenance decision", async () => {
    await request(app)
      .patch(`/api/v1/gateways/${gatewayIdA}`)
      .set("Cookie", adminA.cookie)
      .send({ status: "maintenance" })
      .expect(200);

    await recordHeartbeat({ gatewayKey: "gw-fleet-a", seenAt: new Date() });

    const res = await request(app)
      .get(`/api/v1/gateways/${gatewayIdA}`)
      .set("Cookie", adminA.cookie);
    // Observation must not silently undo an intentional state.
    expect(res.body.data.status).toBe("maintenance");
  });

  test("a gateway reports liveness before any project exists", async () => {
    // Regression: ingest used to reject the payload with "no active project"
    // BEFORE recording the heartbeat, so a freshly commissioned gateway was
    // indistinguishable from a dead one — exactly when an installer standing at
    // the cabinet needs to know it reached the cloud.
    const key = `gw-noproject-${Date.now()}`;
    const created = await request(app)
      .post("/api/v1/gateways")
      .set("Cookie", adminA.cookie)
      .send({ gatewayKey: key, name: "Uncommissioned cabinet" });
    expect(created.status).toBe(201);
    expect(created.body.data.connectivity).toBe("never_reported");

    const ingest = await request(app)
      .post("/api/v1/beamDeviceData")
      .set("x-api-key", process.env.IOT_API_KEY || "change-me")
      .send({
        Type: "HeartbeatData",
        Telemetries: [
          {
            GatewayDeviceId: key,
            DeviceId: "no-such-device",
            Timestamp: Math.floor(Date.now() / 1000),
          },
        ],
      });
    expect(ingest.status).toBe(200);

    const after = await request(app)
      .get(`/api/v1/gateways/${created.body.data.id}`)
      .set("Cookie", adminA.cookie);
    expect(after.body.data.lastSeenAt).not.toBeNull();
    expect(after.body.data.connectivity).toBe("online");
    expect(after.body.data.status).toBe("active");
  });

  test("registering a gateway adopts devices already reporting under its id", async () => {
    // Devices deployed before Gateway was a real entity carry only the legacy
    // gatewayDeviceId string; without adoption the relation stays empty and the
    // fleet view shows a gateway with no devices.
    const res = await request(app)
      .get("/api/v1/gateways")
      .set("Cookie", adminA.cookie);
    const primary = res.body.items.find(
      (g: { gatewayKey: string }) => g.gatewayKey === "gw-fleet-a",
    );
    expect(primary.deviceCount).toBe(1);
  });

  // ── Device credentials (SEC-4) ─────────────────────────────────────────────

  test("a device credential authenticates, and only for its own device", async () => {
    const issued = await issueCredential({
      tenantId: adminA.tenantId,
      deviceId: deviceIdA,
      label: "field unit",
    });
    expect(issued.deviceKey).toContain(".");
    expect(parseDeviceKey(issued.deviceKey)).not.toBeNull();

    const auth = await authenticateDeviceKey(issued.deviceKey);
    expect(auth).not.toBeNull();
    expect(auth!.deviceId).toBe(deviceIdA);
    expect(auth!.tenantId).toBe(adminA.tenantId);
  });

  test("the secret is never retrievable after issue", async () => {
    const listed = await request(app)
      .get(`/api/v1/devices/${deviceIdA}/credentials`)
      .set("Cookie", adminA.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.data.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(listed.body);
    expect(serialized).not.toContain("secretHash");
    for (const row of listed.body.data) {
      expect(row).not.toHaveProperty("secretHash");
      expect(row).toHaveProperty("keyId");
    }
  });

  test("a revoked credential stops authenticating", async () => {
    const issued = await issueCredential({
      tenantId: adminA.tenantId,
      deviceId: deviceIdA,
    });
    expect(await authenticateDeviceKey(issued.deviceKey)).not.toBeNull();

    const row = await prisma.deviceCredential.findFirstOrThrow({
      where: { keyId: issued.keyId },
    });
    const revoke = await request(app)
      .delete(`/api/v1/devices/${deviceIdA}/credentials/${row.id}`)
      .set("Cookie", adminA.cookie);
    expect(revoke.status).toBe(200);

    expect(await authenticateDeviceKey(issued.deviceKey)).toBeNull();
  });

  test("an expired credential stops authenticating", async () => {
    const issued = await issueCredential({
      tenantId: adminA.tenantId,
      deviceId: deviceIdA,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await authenticateDeviceKey(issued.deviceKey)).toBeNull();
  });

  test("malformed and wrong credentials are rejected indistinguishably", async () => {
    expect(await authenticateDeviceKey(undefined)).toBeNull();
    expect(await authenticateDeviceKey("no-dot-here")).toBeNull();
    expect(await authenticateDeviceKey("dk_short.x")).toBeNull();
    expect(
      await authenticateDeviceKey("dk_aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb"),
    ).toBeNull();
  });

  test("another tenant cannot mint or list credentials for a foreign device", async () => {
    const mint = await request(app)
      .post(`/api/v1/devices/${deviceIdA}/credentials`)
      .set("Cookie", adminB.cookie)
      .send({});
    expect(mint.status).toBe(404);

    const listed = await request(app)
      .get(`/api/v1/devices/${deviceIdA}/credentials`)
      .set("Cookie", adminB.cookie);
    expect(listed.status).toBe(404);
  });

  // ── Sensor placement history (§16, §79) ────────────────────────────────────

  test("moving a sensor does not rewrite where its earlier readings were taken", async () => {
    const january = new Date("2026-01-15T00:00:00.000Z");
    const june = new Date("2026-06-15T00:00:00.000Z");

    await request(app)
      .post(`/api/v1/sensor/${sensorIdA}/assignments`)
      .set("Cookie", adminA.cookie)
      .send({ locationId: locationOne, validFrom: january.toISOString() })
      .expect(201);

    await request(app)
      .post(`/api/v1/sensor/${sensorIdA}/assignments`)
      .set("Cookie", adminA.cookie)
      .send({ locationId: locationTwo, validFrom: june.toISOString() })
      .expect(201);

    // A reading taken in March belongs to where the sensor was in March.
    const march = await resolveLocationAt(sensorIdA, new Date("2026-03-01T00:00:00.000Z"));
    expect(march?.locationId).toBe(locationOne);

    // A reading taken in August belongs to the new location.
    const august = await resolveLocationAt(sensorIdA, new Date("2026-08-01T00:00:00.000Z"));
    expect(august?.locationId).toBe(locationTwo);

    // Before it was ever installed, there is no placement — not a guess.
    const before = await resolveLocationAt(sensorIdA, new Date("2025-01-01T00:00:00.000Z"));
    expect(before).toBeNull();

    const history = await request(app)
      .get(`/api/v1/sensor/${sensorIdA}/assignments`)
      .set("Cookie", adminA.cookie);
    expect(history.body.data).toHaveLength(2);
    // The earlier placement is closed, not deleted.
    const closed = history.body.data.find(
      (a: { locationId: number }) => a.locationId === locationOne,
    );
    expect(closed.validTo).not.toBeNull();
  });

  test("a backdated placement that would overlap is refused", async () => {
    const res = await request(app)
      .post(`/api/v1/sensor/${sensorIdA}/assignments`)
      .set("Cookie", adminA.cookie)
      .send({ locationId: locationOne, validFrom: "2026-02-01T00:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/starts before/i);
  });

  // ── Calibration history (§32) ──────────────────────────────────────────────

  test("calibration is recorded as history and applied to the sensor", async () => {
    const res = await request(app)
      .post(`/api/v1/sensor/${sensorIdA}/calibrations`)
      .set("Cookie", adminA.cookie)
      .send({
        calibrationValue: "2.5",
        unit: "uS",
        certificateRef: "CERT-2026-0041",
        performedBy: "NABL Lab",
        performedAt: "2026-02-01T00:00:00.000Z",
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const sensor = await prisma.sensor.findUniqueOrThrow({ where: { id: sensorIdA } });
    expect(sensor.calibrationValue).toBe("2.5");

    const history = await request(app)
      .get(`/api/v1/sensor/${sensorIdA}/calibrations`)
      .set("Cookie", adminA.cookie);
    expect(history.body.data[0].certificateRef).toBe("CERT-2026-0041");
  });

  test("a zero calibration coefficient is refused", async () => {
    // A zero multiplier flattens every reading to 0, which reads as a dead
    // structure rather than a configuration mistake.
    const res = await request(app)
      .post(`/api/v1/sensor/${sensorIdA}/calibrations`)
      .set("Cookie", adminA.cookie)
      .send({ calibrationValue: "0" });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/zero every reading/i);
  });

  test("another tenant cannot read or write sensor history", async () => {
    await request(app)
      .get(`/api/v1/sensor/${sensorIdA}/calibrations`)
      .set("Cookie", adminB.cookie)
      .expect(404);

    await request(app)
      .post(`/api/v1/sensor/${sensorIdA}/assignments`)
      .set("Cookie", adminB.cookie)
      .send({ locationId: locationOne })
      .expect(404);
  });
});
