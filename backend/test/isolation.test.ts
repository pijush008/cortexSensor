import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";

// Deterministic test identities so cleanup is safe across runs.
const EMAIL_A = "iso-admin-a@example.com";
const EMAIL_B = "iso-admin-b@example.com";
const EMAIL_C = "iso-contractor-c@example.com";
const PASSWORD = "Password1!";
const PROJECT_NAME_A = "ISO Project Alpha (A)";
const PRIMARY_UNIQUE_ID = "ISOUNIQ2026A";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw)
    ? raw.join(";")
    : typeof raw === "string"
      ? raw
      : undefined;
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function registerAndLogin(
  email: string,
  userType: "admin" | "contractor" | "authority",
) {
  const reg = await request(app).post(`/api/register/${userType}`).send({
    firstName: "Iso",
    lastName: "Test",
    emailId: email,
    phoneNo: "1234567890",
    password: PASSWORD,
  });
  expect([200, 400]).toContain(reg.status);

  const user = await prisma.user.findUnique({ where: { emailId: email } });
  expect(user).toBeTruthy();
  await prisma.user.update({
    where: { id: user!.id },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });

  const login = await request(app)
    .post("/api/commonLogin")
    .send({ username: email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { userId: user!.id, cookie: cookieHeader(login.headers["set-cookie"]) };
}

async function cleanupTestData() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: [EMAIL_A, EMAIL_B, EMAIL_C] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  await prisma.refreshToken
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => {});
  await prisma.tempOtp.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.firebaseToken
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => {});
  await prisma.auditLog
    .deleteMany({ where: { userId: { in: ids } } })
    .catch(() => {});
  await prisma.sensorData
    .deleteMany({ where: { deviceId: "iso-device-a-01" } })
    .catch(() => {});
  await prisma.nodeData
    .deleteMany({ where: { deviceId: "iso-device-a-01" } })
    .catch(() => {});
  await prisma.projectEmail
    .deleteMany({ where: { project: { projectName: PROJECT_NAME_A } } })
    .catch(() => {});
  await prisma.project
    .deleteMany({ where: { createdBy: { in: ids } } })
    .catch(() => {});
  await prisma.project
    .deleteMany({ where: { projectName: PROJECT_NAME_A } })
    .catch(() => {});
  await prisma.deviceChannel
    .deleteMany({ where: { channelName: { in: ["LVDT1", "LVDT2"] } } })
    .catch(() => {});
  await prisma.sensor
    .deleteMany({ where: { assignedAdmin: { in: ids } } })
    .catch(() => {});
  await prisma.sensor
    .deleteMany({ where: { sensorName: { startsWith: "ISO-" } } })
    .catch(() => {});
  await prisma.device
    .deleteMany({ where: { assignedAdmin: { in: ids } } })
    .catch(() => {});
  await prisma.device
    .deleteMany({ where: { deviceName: { startsWith: "ISO-" } } })
    .catch(() => {});
  await prisma.sensorType
    .deleteMany({ where: { sensorType: "ISO-Temp" } })
    .catch(() => {});
  await prisma.deviceType
    .deleteMany({ where: { deviceType: "ISO-Gateway" } })
    .catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
}

describe("cross-tenant isolation (admin A vs admin B)", () => {
  let adminA: { userId: number; cookie: string };
  let adminB: { userId: number; cookie: string };
  let projectIdA: number;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanupTestData();

    adminA = await registerAndLogin(EMAIL_A, "admin");
    adminB = await registerAndLogin(EMAIL_B, "admin");

    // Tenant A owns: a device type, a device, a sensor type, a sensor,
    // a contractor, and a running project.
    const deviceType = await prisma.deviceType.create({
      data: { deviceType: "ISO-Gateway", status: "one" },
    });
    const device = await prisma.device.create({
      data: {
        deviceName: "ISO-Device-A",
        deviceType: deviceType.id,
        channelCount: 2,
        deviceId: "iso-device-a-01",
        gatewayDeviceId: "iso-gw-a-01",
        addedBy: adminA.userId,
        assignedAdmin: adminA.userId,
        deviceStartDate: new Date(),
        createdAt: new Date(),
        status: "one",
        isDelete: "false_",
      },
    });
    await prisma.deviceChannel.createMany({
      data: [
        { deviceId: String(device.id), channelNumber: "CH 1", channelName: "LVDT1" },
        { deviceId: String(device.id), channelNumber: "CH 2", channelName: "LVDT2" },
      ],
    });

    const sensorType = await prisma.sensorType.create({
      data: {
        sensorType: "ISO-Temp",
        sensorIcon: "temp.png",
        calibrationValue: "1",
        status: "one",
      },
    });
    await prisma.sensor.create({
      data: {
        sensorName: "ISO-Sensor-A",
        sensorTypeID: sensorType.id,
        assignedAdmin: adminA.userId,
        calibrationValue: "1",
        unit: "C",
        status: "one",
      },
    });

    await prisma.user.create({
      data: {
        userType: "contractor",
        parentId: adminA.userId,
        firstName: "IsoC",
        lastName: "Contractor",
        emailId: EMAIL_C,
        phoneNo: "0987654321",
        isMailVerified: "true_",
        isUserVerified: "true_",
        password: "unused-hash",
        status: "true_",
        isDelete: "false_",
      },
    });

    const project = await prisma.project.create({
      data: {
        projectName: PROJECT_NAME_A,
        projectUniqueID: "ISO-PRJ-2026",
        uniqueId: PRIMARY_UNIQUE_ID,
        projectLocation: "Test Street, ISO City",
        startDate: new Date("2026-01-01"),
        contractorId: null,
        authorityId: null,
        deviceId: String(device.id),
        status: "start",
        isDelete: false,
        isRegistered: true,
        createdBy: adminA.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    projectIdA = project.id;

    // Seed one node + sensor telemetry row under admin A's device so both the
    // IOT-scoping test and the telemetry-download test have data to read.
    await prisma.nodeData.create({
      data: {
        battery: 99,
        temperature: 22.5,
        humidity: 40.1,
        pressure: 1013.2,
        gatewayDeviceId: "iso-gw-a-01",
        deviceId: "iso-device-a-01",
        deviceName: "ISO-Device-A",
        projectName: PROJECT_NAME_A,
        deviceType: "ISO-Gateway",
        deviceUpdatedAt: new Date(),
        createdAt: new Date(),
      },
    });
    const sensorA = await prisma.sensor.findFirst({
      where: { sensorName: "ISO-Sensor-A" },
    });
    await prisma.sensorData.create({
      data: {
        projectId: projectIdA,
        deviceId: "iso-device-a-01",
        sensorId: String(sensorA!.id),
        sensorData: 1.5,
        createdAt: new Date(),
      },
    });
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  }, 60000);

  test("admin B cannot read or mutate admin A's project", async () => {
    // Read detail
    const readB = await request(app)
      .get(`/api/project/${projectIdA}`)
      .set("Cookie", adminB.cookie);
    expect(readB.status).toBe(403);

    // PATCH project detail (dash images)
    const patchB = await request(app)
      .patch(`/api/project/${projectIdA}`)
      .set("Cookie", adminB.cookie)
      .send({ dashImage: "data:image/png;base64,AAAA" });
    expect(patchB.status).toBe(403);

    // Full project update
    const updateB = await request(app)
      .put("/api/project")
      .set("Cookie", adminB.cookie)
      .send({
        projectId: String(projectIdA),
        projectName: PROJECT_NAME_A,
        projectLocation: "Attacker location",
      });
    expect(updateB.status).toBe(403);

    // Delete
    const deleteB = await request(app)
      .delete(`/api/project/${projectIdA}`)
      .set("Cookie", adminB.cookie);
    expect(deleteB.status).toBe(403);

    // Owner A can still read theirs
    const readA = await request(app)
      .get(`/api/project/${projectIdA}`)
      .set("Cookie", adminA.cookie);
    expect(readA.status).toBe(200);
  });

  test("admin B cannot list projects scoped to admin A", async () => {
    const resB = await request(app)
      .get(`/api/projects/${adminA.userId}`)
      .set("Cookie", adminB.cookie)
      .query({ page: 1, limit: 10 });
    // Scoped to B's own id: either 404 (no projects of their own) or 200
    // with a list that never includes A's project.
    expect([200, 404]).toContain(resB.status);
    const rows = (resB.body?.projectDetail?.currentData ?? []) as {
      projectName: string;
    }[];
    expect(rows.some((p) => p.projectName === PROJECT_NAME_A)).toBe(false);
  });

  test("admin B cannot access admin A's device, channels, or sensor", async () => {
    const device = await prisma.device.findFirst({
      where: { deviceName: "ISO-Device-A" },
    });
    expect(device).toBeTruthy();

    // Channel list under a foreign device
    const channelsB = await request(app)
      .get(`/api/channelList/${device!.id}`)
      .set("Cookie", adminB.cookie);
    expect(channelsB.status).toBe(403);

    // Update a foreign device
    const patchDeviceB = await request(app)
      .patch(`/api/device/${device!.id}`)
      .set("Cookie", adminB.cookie)
      .send({
        deviceName: "ISO-Device-A",
        channelCount: "2",
        deviceStartDate: new Date().toISOString(),
      });
    expect(patchDeviceB.status).toBe(403);

    // Update a foreign sensor
    const sensor = await prisma.sensor.findFirst({
      where: { sensorName: "ISO-Sensor-A" },
    });
    expect(sensor).toBeTruthy();
    const patchSensorB = await request(app)
      .patch(`/api/sensor/${sensor!.id}`)
      .set("Cookie", adminB.cookie)
      .send({ sensorName: "ISO-Sensor-Hacked" });
    expect(patchSensorB.status).toBe(403);

    // Owner A keeps device + sensor access
    const channelsA = await request(app)
      .get(`/api/channelList/${device!.id}`)
      .set("Cookie", adminA.cookie);
    expect(channelsA.status).toBe(200);
  });

  test("dashboard data is derived from the session, never from the body (IDOR)", async () => {
    // Admin A owns 1 running project -> their dashboard shows it.
    const dashA = await request(app)
      .post("/api/dashboard")
      .set("Cookie", adminA.cookie)
      .send({ userId: String(adminA.userId), userType: "admin" });
    expect(dashA.status).toBe(200);
    expect(dashA.body.data.runningProjects).toBe(1);

    // Admin B sends A's userId in the body: must still yield B's own counts.
    const dashBSpoof = await request(app)
      .post("/api/dashboard")
      .set("Cookie", adminB.cookie)
      .send({ userId: String(adminA.userId), userType: "admin" });
    expect(dashBSpoof.status).toBe(200);
    expect(dashBSpoof.body.data.runningProjects).toBe(0);
  });

  test("admin B cannot list admin A's subtree members or their devices", async () => {
    // Admin A has a contractor; B must not see it via A's adminId.
    const listB = await request(app)
      .get(`/api/user/list/contractor/${adminA.userId}`)
      .set("Cookie", adminB.cookie);
    expect(listB.status).toBe(404);

    // Assigned device lookup is scoped back to B's own id.
    const deviceB = await request(app)
      .get(`/api/admin/device/${adminA.userId}`)
      .set("Cookie", adminB.cookie);
    expect(deviceB.status).toBe(404);

    // Owner A CAN list their own contractor.
    const listA = await request(app)
      .get(`/api/user/list/contractor/${adminA.userId}`)
      .set("Cookie", adminA.cookie);
    expect(listA.status).toBe(200);
    const rows = (listA.body.data?.currentData ?? []) as { emailId: string }[];
    expect(rows.some((r) => r.emailId === EMAIL_C)).toBe(true);
  });

  test("reports + exports for a project are blocked cross-tenant", async () => {
    // Report sensor list
    const reportB = await request(app)
      .post(`/api/reportSensorList/${PRIMARY_UNIQUE_ID}`)
      .set("Cookie", adminB.cookie)
      .send({ offset: "0" });
    expect(reportB.status).toBe(403);

    // Report sensor data
    const reportDataB = await request(app)
      .post(`/api/reportSensorData/1/${PRIMARY_UNIQUE_ID}`)
      .set("Cookie", adminB.cookie)
      .send({ offset: "0" });
    expect(reportDataB.status).toBe(403);

    // Export CSV for the foreign project
    const exportB = await request(app)
      .post(`/api/exportCsv/${PRIMARY_UNIQUE_ID}`)
      .set("Cookie", adminB.cookie);
    expect(exportB.status).toBe(403);

    // Import CSV for the foreign project
    const importB = await request(app)
      .post(`/api/importCsv/${PRIMARY_UNIQUE_ID}`)
      .set("Cookie", adminB.cookie)
      .attach("csvFiles", Buffer.from("a,b\n1,2\n"), "upload.csv");
    expect(importB.status).toBe(403);

    // Owner A can fetch their own report
    const reportA = await request(app)
      .post(`/api/reportSensorList/${PRIMARY_UNIQUE_ID}`)
      .set("Cookie", adminA.cookie)
      .send({ offset: "0" });
    expect(reportA.status).toBe(200);
  });

  test("device/sensor CSV exports are scoped to own tenant", async () => {
    const deviceCsvB = await request(app)
      .post(`/api/download/device/${adminA.userId}`)
      .set("Cookie", adminB.cookie);
    expect(deviceCsvB.status).toBe(404);

    const sensorCsvB = await request(app)
      .post(`/api/download/sensor/${adminA.userId}`)
      .set("Cookie", adminB.cookie);
    expect(sensorCsvB.status).toBe(404);
  });

  test("raw telemetry CSV downloads are tenant-scoped (IDOR)", async () => {
    // B tries to pull A's project's sensor-data export by projectId → blocked.
    const sensorByProjectB = await request(app)
      .post("/api/download/sensorData")
      .set("Cookie", adminB.cookie)
      .send({ projectId: projectIdA });
    expect(sensorByProjectB.status).toBe(403);

    // B tries A's device-telemetry export by deviceId → blocked.
    const sensorByDeviceB = await request(app)
      .post("/api/download/sensorData")
      .set("Cookie", adminB.cookie)
      .send({ deviceId: "iso-device-a-01" });
    expect(sensorByDeviceB.status).toBe(403);

    // nodeData download scoped the same way.
    const nodeB = await request(app)
      .post("/api/download/nodeData")
      .set("Cookie", adminB.cookie)
      .send({ deviceId: "iso-device-a-01" });
    expect(nodeB.status).toBe(403);

    // Owner A can hit both endpoints and get CSV (rows seeded in beforeAll).
    const sensorByProjectA = await request(app)
      .post("/api/download/sensorData")
      .set("Cookie", adminA.cookie)
      .send({ projectId: projectIdA });
    expect(sensorByProjectA.status).toBe(200);
    expect(sensorByProjectA.headers["content-type"]).toContain("text/csv");

    const nodeA = await request(app)
      .post("/api/download/nodeData")
      .set("Cookie", adminA.cookie)
      .send({ deviceId: "iso-device-a-01" });
    expect(nodeA.status).toBe(200);
  });

  test("IOT node/sensor data reads are scoped to own devices (IDOR)", async () => {
    // Admin B owns no devices: node data feed never includes A's device.
    const nodeB = await request(app)
      .get("/api/beamNodeData")
      .set("Cookie", adminB.cookie);
    expect(nodeB.status).toBe(200);
    const nodeRowsB = (nodeB.body.data ?? []) as { deviceId: string }[];
    expect(nodeRowsB.some((n) => n.deviceId === "iso-device-a-01")).toBe(false);

    // Owner A sees their own node data.
    const nodeA = await request(app)
      .get("/api/beamNodeData")
      .set("Cookie", adminA.cookie);
    expect(nodeA.status).toBe(200);
    const nodeRowsA = (nodeA.body.data ?? []) as { deviceId: string }[];
    expect(nodeRowsA.some((n) => n.deviceId === "iso-device-a-01")).toBe(true);

    // B cannot read sensor data for A's device.
    const sensorB = await request(app)
      .get("/api/beamGetSensorData")
      .set("Cookie", adminB.cookie)
      .query({ deviceId: "iso-device-a-01", GatewayDeviceId: "iso-gw-a-01" });
    expect(sensorB.status).toBe(403);

    // Owner A can.
    const sensorA = await request(app)
      .get("/api/beamGetSensorData")
      .set("Cookie", adminA.cookie)
      .query({ deviceId: "iso-device-a-01", GatewayDeviceId: "iso-gw-a-01" });
    expect(sensorA.status).toBe(200);
  });
});