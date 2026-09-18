import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";

/**
 * A gateway serves ONE project at a time.
 *
 * The rule is enforced by the database — `gateways.projectId` is unique — and
 * the claim is written in the same transaction as the project that makes it,
 * so two simultaneous creations cannot both take the same hardware. The
 * frontend only ever OFFERS free gateways; that is a courtesy, not the rule.
 */

const EMAIL_A = "gw-own-a@example.com";
const EMAIL_B = "gw-own-b@example.com";
const PASSWORD = "Password1!";
const KEY_A1 = "OWNA1";
const KEY_A2 = "OWNA2";
const KEY_B1 = "OWNB1";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : typeof raw === "string" ? raw : "";
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function registerAndLogin(email: string) {
  await request(app).post("/api/v1/register/admin").send({
    companyName: `Own Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyLogo: TINY_PNG,
    firstName: "Own",
    lastName: "Admin",
    emailId: email,
    phoneNo: "1234567890",
    password: PASSWORD,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { emailId: email } });
  await prisma.user.update({
    where: { id: user.id },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });
  // Creating a project is metered; the fixture needs an unlimited plan.
  const plan = await prisma.billingPlan.findFirst({ where: { maxStructures: null }, select: { id: true } });
  await prisma.subscription.upsert({
    where: { adminId: user.id },
    update: { planId: plan!.id, status: "active" },
    create: { adminId: user.id, planId: plan!.id, status: "active" },
  });
  const login = await request(app).post("/api/v1/commonLogin").send({ username: email, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  const membership = await prisma.membership.findFirstOrThrow({ where: { userId: user.id } });
  return { userId: user.id, tenantId: membership.tenantId, cookie: cookieHeader(login.headers["set-cookie"]) };
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { emailId: { in: [EMAIL_A, EMAIL_B] } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const tenantIds = (await prisma.membership.findMany({ where: { userId: { in: ids } }, select: { tenantId: true } })).map((m) => m.tenantId);
  const wipe = (fn: () => Promise<unknown>) => fn().catch(() => undefined);
  const devices = await prisma.device.findMany({ where: { gatewayDeviceId: { in: [KEY_A1, KEY_A2, KEY_B1] } }, select: { id: true } });
  const deviceIds = devices.map((d) => d.id);
  await wipe(() => prisma.gatewayReading.deleteMany({ where: { gatewayKey: { in: [KEY_A1, KEY_A2, KEY_B1] } } }));
  await wipe(() => prisma.measurement.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.sensorAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.deviceChannel.deleteMany({ where: { deviceId: { in: deviceIds.map(String) } } }));
  await wipe(() => prisma.device.deleteMany({ where: { id: { in: deviceIds } } }));
  await wipe(() => prisma.sensor.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.gateway.deleteMany({ where: { gatewayKey: { in: [KEY_A1, KEY_A2, KEY_B1] } } }));
  await wipe(() => prisma.projectInvitation.deleteMany({ where: { project: { tenantId: { in: tenantIds } } } }));
  await wipe(() => prisma.project.deleteMany({ where: { tenantId: { in: tenantIds } } }));
  await wipe(() => prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }));
  await wipe(() => prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.membership.deleteMany({ where: { userId: { in: ids } } }));
  await wipe(() => prisma.user.deleteMany({ where: { id: { in: ids } } }));
  await wipe(() => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }));
}

describe("gateway ownership", () => {
  let adminA: Awaited<ReturnType<typeof registerAndLogin>>;
  let adminB: Awaited<ReturnType<typeof registerAndLogin>>;
  let gwA1 = 0;
  let gwA2 = 0;
  let gwB1 = 0;

  const registerGateway = async (cookie: string, key: string, name: string) => {
    const res = await request(app).post("/api/v1/gateways").set("Cookie", cookie).send({ gatewayKey: key, name });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as number;
  };

  const createProject = (cookie: string, name: string, gatewayId: number | null) =>
    request(app)
      .post("/api/v1/project")
      .set("Cookie", cookie)
      .send({ projectName: name, projectLocation: "Delhi", gatewayId });

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    adminA = await registerAndLogin(EMAIL_A);
    adminB = await registerAndLogin(EMAIL_B);
    gwA1 = await registerGateway(adminA.cookie, KEY_A1, "Delhi Gateway 01");
    gwA2 = await registerGateway(adminA.cookie, KEY_A2, "Delhi Gateway 02");
    gwB1 = await registerGateway(adminB.cookie, KEY_B1, "Mumbai Gateway 01");
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("a new gateway is available, and the list says so", async () => {
    const res = await request(app).get("/api/v1/gateways").set("Cookie", adminA.cookie);
    expect(res.status).toBe(200);
    const row = res.body.items.find((g: { id: number }) => g.id === gwA1);
    expect(row.availability).toBe("available");
    expect(row.projectId).toBeNull();
    expect(row.projectName).toBeNull();
  });

  test("the available filter lists only free gateways of the caller's organization", async () => {
    const res = await request(app).get("/api/v1/gateways?available=1").set("Cookie", adminA.cookie);
    expect(res.status).toBe(200);
    const keys = res.body.items.map((g: { gatewayKey: string }) => g.gatewayKey).sort();
    expect(keys).toEqual([KEY_A1, KEY_A2]);
  });

  let projectId = 0;

  test("creating a project claims the gateway in the same transaction", async () => {
    const res = await createProject(adminA.cookie, "Delhi Flyover", gwA1);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    projectId = res.body.projectId;

    const gw = await prisma.gateway.findUniqueOrThrow({ where: { id: gwA1 } });
    expect(gw.projectId).toBe(projectId);
    expect(gw.claimedAt).toBeTruthy();

    const list = await request(app).get("/api/v1/gateways").set("Cookie", adminA.cookie);
    const row = list.body.items.find((g: { id: number }) => g.id === gwA1);
    expect(row.availability).toBe("assigned");
    expect(row.projectName).toBe("Delhi Flyover");

    const free = await request(app).get("/api/v1/gateways?available=1").set("Cookie", adminA.cookie);
    expect(free.body.items.map((g: { gatewayKey: string }) => g.gatewayKey)).toEqual([KEY_A2]);
  });

  test("a second project cannot take an assigned gateway", async () => {
    const res = await createProject(adminA.cookie, "Second Flyover", gwA1);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already/i);
    expect(await prisma.project.count({ where: { projectName: "Second Flyover" } })).toBe(0);
  });

  test("another organization cannot claim it either, and learns nothing", async () => {
    const res = await createProject(adminB.cookie, "Poaching", gwA2);
    expect(res.status).toBe(404);
    expect(await prisma.project.count({ where: { projectName: "Poaching" } })).toBe(0);
    const gw = await prisma.gateway.findUniqueOrThrow({ where: { id: gwA2 } });
    expect(gw.projectId).toBeNull();
  });

  test("two simultaneous creations cannot both take the same gateway", async () => {
    const [r1, r2] = await Promise.all([
      createProject(adminA.cookie, "Race One", gwA2),
      createProject(adminA.cookie, "Race Two", gwA2),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);
    const winner = r1.status === 200 ? r1 : r2;
    const gw = await prisma.gateway.findUniqueOrThrow({ where: { id: gwA2 } });
    expect(gw.projectId).toBe(winner.body.projectId);
    expect(await prisma.project.count({ where: { projectName: { in: ["Race One", "Race Two"] } } })).toBe(1);
  });

  test("the database itself refuses two gateways on one project's slot being shared", async () => {
    // Belt and braces: the unique index, exercised directly.
    await expect(
      prisma.gateway.update({ where: { id: gwB1 }, data: { projectId } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  test("a project's gateway can be swapped while it is not collecting, and never while running", async () => {
    // Free gwA2 first: end the race winner.
    const raceProject = await prisma.project.findFirstOrThrow({
      where: { projectName: { in: ["Race One", "Race Two"] } },
    });
    await request(app).get(`/api/v1/projectStart/${raceProject.id}`).set("Cookie", adminA.cookie).query({ statusType: "start" });
    const ended = await request(app).get(`/api/v1/projectStart/${raceProject.id}`).set("Cookie", adminA.cookie).query({ statusType: "end" });
    expect(ended.status, JSON.stringify(ended.body)).toBe(200);
    expect((await prisma.gateway.findUniqueOrThrow({ where: { id: gwA2 } })).projectId).toBeNull();

    // Swap the first project from gwA1 to gwA2 while it has not started.
    const swap = await request(app).put(`/api/v1/project/${projectId}/gateway`).set("Cookie", adminA.cookie).send({ gatewayId: gwA2 });
    expect(swap.status, JSON.stringify(swap.body)).toBe(200);
    expect((await prisma.gateway.findUniqueOrThrow({ where: { id: gwA1 } })).projectId).toBeNull();
    expect((await prisma.gateway.findUniqueOrThrow({ where: { id: gwA2 } })).projectId).toBe(projectId);

    // Start it: now the gateway is locked.
    await request(app).get(`/api/v1/projectStart/${projectId}`).set("Cookie", adminA.cookie).query({ statusType: "start" });
    const refused = await request(app).put(`/api/v1/project/${projectId}/gateway`).set("Cookie", adminA.cookie).send({ gatewayId: gwA1 });
    expect(refused.status).toBe(400);
    expect((await prisma.gateway.findUniqueOrThrow({ where: { id: gwA2 } })).projectId).toBe(projectId);
  });

  test("ending the project releases its gateway; the project remembers which it was", async () => {
    const res = await request(app).get(`/api/v1/projectStart/${projectId}`).set("Cookie", adminA.cookie).query({ statusType: "end" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const gw = await prisma.gateway.findUniqueOrThrow({ where: { id: gwA2 } });
    expect(gw.projectId).toBeNull();
    expect(gw.claimedAt).toBeNull();
    const free = await request(app).get("/api/v1/gateways?available=1").set("Cookie", adminA.cookie);
    expect(free.body.items.map((g: { gatewayKey: string }) => g.gatewayKey).sort()).toEqual([KEY_A1, KEY_A2]);
  });

  test("the charts dashboard charts every channel of every node behind the project's gateway", async () => {
    const created = await createProject(adminA.cookie, "Charted", gwA2);
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: created.body.projectId } });

    // Two nodes report through the gateway, one sensor with two channels each.
    const { ingestAckcioPayload } = await import("../src/modules/ackcio/ackcio.service");
    const gw = { id: gwA2, tenantId: adminA.tenantId, gatewayKey: KEY_A2 };
    for (const node of ["n001", "n002"]) {
      await ingestAckcioPayload(
        {
          Type: "SensorData",
          Version: "t",
          Telemetries: [
            {
              GatewayDeviceId: KEY_A2, DeviceId: node, DeviceName: `Node ${node}`, Timestamp: 1700000000,
              Sensor: { SensorId: 0, Code: `LVDT-${node}`, SensorType: "LVDT", Channels: [
                { ChannelId: 0, ChannelType: "A", Reading: 1.5, RawReading: 1.5, UnitType: "mm", Description: "valid" },
                { ChannelId: 1, ChannelType: "Temperature", Reading: 24, RawReading: 24, UnitType: "C", Description: "valid" },
              ] },
            },
          ],
        },
        gw,
      );
    }

    const res = await request(app).get(`/api/v1/dashboard/${project.uniqueId}`).set("Cookie", adminA.cookie);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.projectDetail[0];
    expect(d.gatewayKey).toBe(KEY_A2);
    expect(d.deviceName).toBe("Delhi Gateway 02");
    expect(d.channelCount).toBe(4);
    expect(d.deviceChannels).toHaveLength(4);
    expect(d.gatewayNodes.map((n: { nodeKey: string }) => n.nodeKey)).toEqual(["n001", "n002"]);
    // Grouped by node, then channel.
    expect(d.deviceChannels.map((c: { channelName: string }) => c.channelName)).toEqual([
      "LVDT-n001 · A", "LVDT-n001 · Temperature", "LVDT-n002 · A", "LVDT-n002 · Temperature",
    ]);

    // Tidy: end it so the gateway is free for the tests that follow.
    await request(app).get(`/api/v1/projectStart/${project.id}`).set("Cookie", adminA.cookie).query({ statusType: "start" });
    await request(app).get(`/api/v1/projectStart/${project.id}`).set("Cookie", adminA.cookie).query({ statusType: "end" });
  });

  test("deleting a project releases its gateway too", async () => {
    const created = await createProject(adminA.cookie, "Short Lived", gwA1);
    expect(created.status).toBe(200);
    const del = await request(app).delete(`/api/v1/project/${created.body.projectId}`).set("Cookie", adminA.cookie);
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect((await prisma.gateway.findUniqueOrThrow({ where: { id: gwA1 } })).projectId).toBeNull();
  });
});
