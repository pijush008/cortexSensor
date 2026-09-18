import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { subscribeTenant, type StreamEvent } from "../src/modules/stream/event-bus";
import { issueIngestToken } from "../src/modules/gateways/gateways.service";
import { resolveAuthContext } from "../src/modules/rbac/rbac.service";
import { TINY_PNG } from "./fixtures/registration";
import * as samples from "./fixtures/ackcio-payloads";

/**
 * An Ackcio gateway pushing to this server, end to end over HTTP.
 *
 * Two organizations each register a gateway. Every push from A's gateway must
 * land in A's account and nowhere else; B must see none of it. And every
 * payload kind the specification describes must be acknowledged with 200 and
 * stored — the gateway retries anything else for ever (§7).
 */

const EMAIL_A = "ackcio-a@example.com";
const EMAIL_B = "ackcio-b@example.com";
const PASSWORD = "Password1!";
const KEY_A = "F01E";
const KEY_B = "B0B0";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function registerAndLogin(email: string) {
  await request(app).post("/api/v1/register/admin").send({
    companyName: `Ackcio Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyLogo: TINY_PNG,
    firstName: "Ackcio",
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
  const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id } });
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
  const gatewayKeys = [KEY_A, KEY_B];

  const wipe = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* absent on first run */
    }
  };

  const devices = await prisma.device.findMany({
    where: { OR: [{ tenantId: { in: tenantIds } }, { gatewayDeviceId: { in: gatewayKeys } }] },
    select: { id: true },
  });
  const deviceIds = devices.map((d) => d.id);

  await wipe(() => prisma.gatewayReading.deleteMany({ where: { gatewayKey: { in: gatewayKeys } } }));
  await wipe(() => prisma.nodeNetworkData.deleteMany({ where: { gatewayKey: { in: gatewayKeys } } }));
  await wipe(() => prisma.gatewayHeartbeat.deleteMany({ where: { gatewayKey: { in: gatewayKeys } } }));
  await wipe(() => prisma.nodeData.deleteMany({ where: { gatewayDeviceId: { in: gatewayKeys } } }));
  await wipe(() => prisma.measurement.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() =>
    prisma.notification.deleteMany({ where: { sensorData: { deviceId: { in: ["ecde", "abdc", "dg100"] } } } }),
  );
  await wipe(() => prisma.sensorData.deleteMany({ where: { deviceId: { in: ["ecde", "abdc", "dg100"] } } }));
  await wipe(() => prisma.sensorAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.deviceChannel.deleteMany({ where: { deviceId: { in: deviceIds.map(String) } } }));
  await wipe(() => prisma.project.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.device.deleteMany({ where: { id: { in: deviceIds } } }));
  await wipe(() => prisma.sensor.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.gateway.deleteMany({ where: { gatewayKey: { in: gatewayKeys } } }));
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
}

describe("Ackcio gateway push", () => {
  let adminA: Awaited<ReturnType<typeof registerAndLogin>>;
  let adminB: Awaited<ReturnType<typeof registerAndLogin>>;
  let gatewayA = 0;
  let gatewayB = 0;
  let tokenA = "";
  let tokenB = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    adminA = await registerAndLogin(EMAIL_A);
    adminB = await registerAndLogin(EMAIL_B);

    const createA = await request(app)
      .post("/api/v1/gateways")
      .set("Cookie", adminA.cookie)
      .send({ gatewayKey: KEY_A, name: "Site A gateway" });
    expect(createA.status, JSON.stringify(createA.body)).toBe(201);
    gatewayA = createA.body.data.id;

    const createB = await request(app)
      .post("/api/v1/gateways")
      .set("Cookie", adminB.cookie)
      .send({ gatewayKey: KEY_B, name: "Site B gateway" });
    expect(createB.status).toBe(201);
    gatewayB = createB.body.data.id;

    // B's token straight from the service; A's through the console route,
    // which is tested below.
    tokenB = (await issueIngestToken(await resolveAuthContext(adminB.userId), gatewayB)).token;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const push = (token: string, body: unknown) =>
    request(app).post(`/api/v1/ingest/ackcio/${token}`).send(body);

  describe("the push URL", () => {
    test("is issued from the console, once, with the token in the address", async () => {
      const res = await request(app)
        .post(`/api/v1/gateways/${gatewayA}/ingest-token`)
        .set("Cookie", adminA.cookie);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      tokenA = res.body.data.token;
      expect(tokenA).toMatch(/^[A-Za-z0-9_-]{32,}$/);
      expect(res.body.data.url).toBe(`http://localhost:3000/api/v1/ingest/ackcio/${tokenA}`);

      // The list reports that a URL exists, and nothing more.
      const list = await request(app).get("/api/v1/gateways").set("Cookie", adminA.cookie);
      const row = list.body.items.find((g: { id: number }) => g.id === gatewayA);
      expect(row.hasIngestToken).toBe(true);
      expect(JSON.stringify(list.body)).not.toContain(tokenA);
    });

    test("cannot be issued for another organization's gateway", async () => {
      const res = await request(app)
        .post(`/api/v1/gateways/${gatewayA}/ingest-token`)
        .set("Cookie", adminB.cookie);
      expect(res.status).toBe(404);
    });

    test("refuses a wrong or missing credential with 401", async () => {
      expect((await push("not-a-real-token-at-all-0000000000", samples.sensorDataVW)).status).toBe(401);
      expect((await request(app).post("/api/v1/ingest/ackcio").send(samples.sensorDataVW)).status).toBe(401);
    });

    test("refuses a payload from a different gateway with 403", async () => {
      const res = await push(tokenA, samples.rekey(samples.sensorDataVW, "ZZZZ"));
      expect(res.status).toBe(403);
      expect(res.body.message).toContain("ZZZZ");
    });

    test("refuses a body that is not a push with 400", async () => {
      const res = await push(tokenA, { hello: "gateway" });
      expect(res.status).toBe(400);
    });

    test("is also accepted as a header", async () => {
      const res = await request(app)
        .post("/api/v1/ingest/ackcio")
        .set("x-gateway-token", tokenA)
        .send(samples.rekey(samples.heartbeatData, KEY_A));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });
  });

  describe("SensorData", () => {
    test("discovers the node and its channels, and stores every channel twice over", async () => {
      const received: StreamEvent[] = [];
      const unsubscribe = subscribeTenant(adminA.tenantId, (e) => received.push(e));

      const res = await push(tokenA, samples.sensorDataVW);
      unsubscribe();
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.stored).toBe(3);
      expect(res.body.duplicates).toBe(0);

      const device = await prisma.device.findFirst({
        where: { deviceId: "ecde" },
        include: { deviceTypeRecord: true },
      });
      expect(device).toBeTruthy();
      expect(device!.tenantId).toBe(adminA.tenantId);
      expect(device!.gatewayId).toBe(gatewayA);
      expect(device!.deviceName).toBe("VW-NODE-1");
      expect(device!.deviceTypeRecord.deviceType).toBe("BEAM-VW-S1");
      expect(device!.channelCount).toBe(3);

      const channels = await prisma.deviceChannel.findMany({
        where: { deviceId: String(device!.id) },
        orderBy: { channelNumber: "asc" },
      });
      expect(channels.map((c) => c.channelNumber)).toEqual(["0.0", "0.1", "0.2"]);
      expect(channels.map((c) => c.channelName)).toEqual([
        "SG2001 · Frequency",
        "SG2001 · Temperature",
        "SG2001 · SignalQuality",
      ]);
      // Signal quality is the instrument's health, not the structure's: kept,
      // but not put on the project dashboard.
      expect(channels.map((c) => c.activeStatus)).toEqual(["one", "one", "zero"]);

      const sensors = await prisma.sensor.findMany({
        where: { id: { in: channels.map((c) => Number(c.assignSensor)) } },
        include: { sensorType: true },
        orderBy: { id: "asc" },
      });
      expect(sensors.map((s) => s.sensorType.sensorType)).toEqual([
        "Vibrating Wire",
        "Temperature",
        "Signal Quality",
      ]);
      expect(sensors.map((s) => s.unit)).toEqual(["µε", "C", "%"]);
      expect(sensors.every((s) => s.tenantId === adminA.tenantId)).toBe(true);

      // The complete record.
      const readings = await prisma.gatewayReading.findMany({
        where: { gatewayId: gatewayA, nodeKey: "ecde" },
        orderBy: { channelId: "asc" },
      });
      expect(readings).toHaveLength(3);
      expect(readings[0]).toMatchObject({
        tenantId: adminA.tenantId,
        deviceId: device!.id,
        sensorIndex: 0,
        code: "SG2001",
        sensorType: "VibratingWire",
        channelType: "Frequency",
        reading: 20.98,
        rawReading: 875.8,
        unit: "µε",
        rawUnit: "Hz",
        description: "valid",
        isError: false,
      });
      expect(readings[0].ts.toISOString()).toBe(new Date(1544493651 * 1000).toISOString());

      // The number the platform acts on: the gateway's engineering value,
      // NOT the raw frequency re-multiplied by a coefficient.
      const measurements = await prisma.measurement.findMany({
        where: { tenantId: adminA.tenantId, deviceId: device!.id },
        orderBy: { sensorId: "asc" },
      });
      expect(measurements).toHaveLength(3);
      expect(measurements[0].value).toBe(20.98);
      expect(measurements[0].rawValue).toBe(875.8);
      expect(measurements[0].gatewayId).toBe(gatewayA);
      expect(measurements[0].qualityFlags).not.toContain("OUT_OF_RANGE");

      // And it went out live, to A's stream only.
      const live = received.filter((e) => e.type === "measurement");
      expect(live).toHaveLength(3);
      expect(live.every((e) => e.tenantId === adminA.tenantId)).toBe(true);
    });

    test("a retried push is stored once", async () => {
      const before = await prisma.gatewayReading.count({ where: { gatewayId: gatewayA } });
      const res = await push(tokenA, samples.sensorDataVW);
      expect(res.status).toBe(200);
      expect(res.body.stored).toBe(0);
      expect(res.body.duplicates).toBe(3);
      expect(await prisma.gatewayReading.count({ where: { gatewayId: gatewayA } })).toBe(before);
      const device = await prisma.device.findFirstOrThrow({ where: { deviceId: "ecde" } });
      expect(await prisma.measurement.count({ where: { deviceId: device.id } })).toBe(3);
      // No duplicate sensors or channels either.
      expect(await prisma.deviceChannel.count({ where: { deviceId: String(device.id) } })).toBe(3);
    });

    test("a retry batch spanning two nodes discovers both", async () => {
      const res = await push(tokenA, samples.sensorDataRetryBatch);
      expect(res.status).toBe(200);
      expect(res.body.stored).toBe(6);
      const nodes = await prisma.device.findMany({
        where: { gatewayId: gatewayA, deviceId: { in: ["ecde", "abdc"] } },
      });
      expect(nodes).toHaveLength(2);
    });

    test("a ShapeArray chain is one node with a sensor per segment", async () => {
      const res = await push(tokenA, samples.shapeArrayChain(12));
      expect(res.status).toBe(200);
      expect(res.body.stored).toBe(48);
      const device = await prisma.device.findFirstOrThrow({ where: { deviceId: "dg100" } });
      expect(device.channelCount).toBe(48);
      const channels = await prisma.deviceChannel.findMany({ where: { deviceId: String(device.id) } });
      expect(channels.map((c) => c.channelNumber)).toContain("11.3");
      const sensor = await prisma.sensor.findFirst({
        where: { id: Number(channels.find((c) => c.channelNumber === "11.3")!.assignSensor) },
        include: { sensorType: true },
      });
      expect(sensor!.sensorName).toBe("DG_12Metre · Temperature");
      expect(sensor!.sensorType.sensorType).toBe("Temperature");
    });

    test("feeds a running project's legacy table, and only a running one", async () => {
      const device = await prisma.device.findFirstOrThrow({ where: { deviceId: "abdc" } });
      const project = await prisma.project.create({
        data: {
          projectName: "Ackcio Project",
          projectLocation: "Kolkata",
          startDate: new Date(),
          tenantId: adminA.tenantId,
          createdBy: adminA.userId,
          deviceId: String(device.id),
          sensorId: device.assignSensor ?? "[]",
          status: "pause",
          isDelete: false,
          isRegistered: true,
          offset: 0,
          csvData: false,
          uniqueId: `ack${Date.now()}`.slice(0, 20),
        },
      });

      const paused = samples.rekey(samples.sensorDataRetryBatch, KEY_A);
      (paused.Telemetries[1] as { Timestamp: number }).Timestamp += 60;
      await push(tokenA, paused);
      expect(await prisma.sensorData.count({ where: { projectId: project.id } })).toBe(0);

      await prisma.project.update({ where: { id: project.id }, data: { status: "start" } });
      (paused.Telemetries[1] as { Timestamp: number }).Timestamp += 60;
      await push(tokenA, paused);
      expect(await prisma.sensorData.count({ where: { projectId: project.id } })).toBe(3);
    });
  });

  describe("ErrorSensorData", () => {
    test("is kept, marked, and flagged only on the channel the gateway rejected", async () => {
      const res = await push(tokenA, samples.rekey(samples.errorSensorData, KEY_A));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.stored).toBe(3);

      const rows = await prisma.gatewayReading.findMany({
        where: { gatewayId: gatewayA, nodeKey: "123c" },
        orderBy: { channelId: "asc" },
      });
      expect(rows.every((r) => r.isError)).toBe(true);
      expect(rows.map((r) => r.description)).toEqual(["valid", "valid", "error"]);

      const device = await prisma.device.findFirstOrThrow({ where: { deviceId: "123c" } });
      const measurements = await prisma.measurement.findMany({
        where: { deviceId: device.id },
        orderBy: { sensorId: "asc" },
      });
      expect(measurements).toHaveLength(3);
      expect(measurements[0].qualityFlags).not.toContain("OUT_OF_RANGE");
      expect(measurements[2].qualityFlags).toContain("OUT_OF_RANGE");
      expect(measurements[2].value).toBe(-92.85);
    });
  });

  describe("node and gateway health", () => {
    test("NodeData is stored in millivolts, never as a percentage", async () => {
      const res = await push(tokenA, samples.nodeData);
      expect(res.status).toBe(200);
      expect(res.body.stored).toBe(1);
      const row = await prisma.nodeData.findFirst({
        where: { gatewayDeviceId: KEY_A, deviceId: "cd100" },
        orderBy: { id: "desc" },
      });
      expect(row!.batteryMillivolts).toBe(3888);
      expect(row!.battery).toBeNull();
      expect(row!.temperature).toBeCloseTo(28.1299, 3);
      // The node itself was discovered from the report.
      expect(await prisma.device.findFirst({ where: { deviceId: "cd100", gatewayId: gatewayA } })).toBeTruthy();
    });

    test("NetworkData records the node's link", async () => {
      const res = await push(tokenA, samples.networkData);
      expect(res.status).toBe(200);
      const row = await prisma.nodeNetworkData.findFirst({ where: { gatewayId: gatewayA, nodeKey: "cd100" } });
      expect(row).toMatchObject({ parentKey: "cfa0", etx: 93, rssi: 73, tenantId: adminA.tenantId });
    });

    test("HeartbeatData, which names no node, is acknowledged and stored", async () => {
      const before = await prisma.gateway.findUniqueOrThrow({ where: { id: gatewayA } });
      const res = await push(tokenA, samples.rekey(samples.heartbeatData, "f01e"));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.stored).toBe(1);
      const row = await prisma.gatewayHeartbeat.findFirst({
        where: { gatewayId: gatewayA },
        orderBy: { id: "desc" },
      });
      expect(row).toMatchObject({
        diskUsed: 11.4,
        diskSpace: 14.5,
        powerInVolts: 10.8199,
        dataUsage: 123,
        internetMode: "LAN",
      });
      const after = await prisma.gateway.findUniqueOrThrow({ where: { id: gatewayA } });
      expect(after.lastSeenAt).toBeTruthy();
      expect(after.status).toBe("active");
      expect(after.ingestTokenLastUsedAt).toBeTruthy();
      void before;
    });

    test("an unknown payload type is acknowledged rather than retried for ever", async () => {
      const res = await push(tokenA, { Type: "SomethingNew", Telemetries: [{ x: 1 }] });
      expect(res.status).toBe(200);
      expect(res.body.ignored).toBe(1);
    });
  });

  describe("isolation", () => {
    test("B's gateway lands in B's account; A sees none of it", async () => {
      const res = await push(tokenB, samples.rekey(samples.sensorDataVW, KEY_B, "bbbb"));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const device = await prisma.device.findFirstOrThrow({ where: { deviceId: "bbbb" } });
      expect(device.tenantId).toBe(adminB.tenantId);
      expect(await prisma.measurement.count({ where: { deviceId: device.id, tenantId: adminA.tenantId } })).toBe(0);

      const seenByA = await request(app)
        .get(`/api/v1/gateways/${gatewayB}/telemetry`)
        .set("Cookie", adminA.cookie);
      expect(seenByA.status).toBe(404);
    });

    test("a node id already used by another organization gets a gateway-prefixed serial", async () => {
      // "ecde" is A's. B's gateway reporting an "ecde" must not take it over.
      const res = await push(tokenB, samples.rekey(samples.sensorDataVW, KEY_B));
      expect(res.status).toBe(200);
      const a = await prisma.device.findFirstOrThrow({ where: { deviceId: "ecde" } });
      expect(a.tenantId).toBe(adminA.tenantId);
      const b = await prisma.device.findFirst({ where: { deviceId: `${KEY_B}:ecde` } });
      expect(b?.tenantId).toBe(adminB.tenantId);
      expect(b?.gatewayId).toBe(gatewayB);
    });
  });

  describe("the telemetry view", () => {
    test("reports each node's latest reading per channel, health and link", async () => {
      const res = await request(app)
        .get(`/api/v1/gateways/${gatewayA}/telemetry`)
        .set("Cookie", adminA.cookie);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const data = res.body.data;
      expect(data.gateway.gatewayKey).toBe(KEY_A);
      expect(data.gateway.hasIngestToken).toBe(true);
      expect(data.heartbeat.internetMode).toBe("LAN");

      const byKey = Object.fromEntries(
        data.nodes.map((n: { device: { nodeKey: string } }) => [n.device.nodeKey, n]),
      );
      expect(Object.keys(byKey).sort()).toEqual(["123c", "abdc", "cd100", "dg100", "ecde"]);

      const vw = byKey.ecde;
      expect(vw.channels).toHaveLength(3);
      expect(vw.channels[0]).toMatchObject({
        channelNumber: "0.0",
        code: "SG2001",
        channelType: "Frequency",
        sensorName: "SG2001 · Frequency",
        platformType: "Vibrating Wire",
        reading: 20.98,
        unit: "µε",
      });
      // Latest, not first: abdc was pushed three times, the last one 120 s on.
      expect(new Date(byKey.abdc.channels[0].ts).getTime()).toBe((1544493677 + 120) * 1000);

      expect(byKey.cd100.health).toMatchObject({ batteryMillivolts: 3888, batteryPercent: null });
      expect(byKey.cd100.link).toMatchObject({ parentKey: "cfa0", etx: 93, rssi: 73 });
      // A node that has never reported health says so, rather than 0.
      expect(byKey.ecde.health).toBeNull();

      expect(byKey.dg100.channels).toHaveLength(48);
    });

    test("re-issuing the URL revokes the old one", async () => {
      const res = await request(app)
        .post(`/api/v1/gateways/${gatewayA}/ingest-token`)
        .set("Cookie", adminA.cookie);
      expect(res.status).toBe(201);
      const fresh = res.body.data.token;
      expect((await push(tokenA, samples.nodeData)).status).toBe(401);
      expect((await push(fresh, samples.nodeData)).status).toBe(200);
      tokenA = fresh;
    });
  });
});
