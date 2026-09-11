import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";
import { deleteEmptyTenants, tenantIdsFor } from "./fixtures/tenants";

/**
 * Choosing the hardware a project monitors.
 *
 * A device is one physical cabinet in one place, so it can serve one live
 * project at a time. The machinery for that half-existed: `isOngoing` was
 * RELEASED when a project ended and never CLAIMED by anything, because the only
 * code that set it was `projectSetup`, a legacy step the current frontend does
 * not call. The check that read the flag could therefore never fire.
 */

const ADMIN_EMAIL = "dev-admin@example.com";
const OTHER_EMAIL = "dev-other@example.com";
const PASSWORD = "Password1!";

const ALL_EMAILS = [ADMIN_EMAIL, OTHER_EMAIL];

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : (raw as string);
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post("/api/commonLogin")
    .send({ username: email, password: PASSWORD });
  expect(res.status).toBe(200);
  return cookieHeader(res.headers["set-cookie"]);
}

async function registerAdmin(email: string) {
  await request(app)
    .post("/api/register/admin")
    .send({
      companyName: `Dev Org ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyLogo: TINY_PNG,
      firstName: "Dev",
      lastName: "Admin",
      emailId: email,
      phoneNo: "1234567890",
      password: PASSWORD,
    });

  const user = await prisma.user.findUnique({ where: { emailId: email } });
  await prisma.user.update({
    where: { id: user!.id },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: user!.id },
    select: { tenantId: true },
  });

  const plan = await prisma.billingPlan.findFirst({
    where: { maxStructures: null },
    select: { id: true },
  });
  await prisma.subscription.upsert({
    where: { adminId: user!.id },
    update: { planId: plan!.id, status: "active" },
    create: { adminId: user!.id, planId: plan!.id, status: "active" },
  });

  return { userId: user!.id, tenantId: membership!.tenantId };
}

/** A device belonging to one admin's organization. */
async function makeDevice(opts: {
  serial: string;
  adminId: number;
  tenantId: number;
  sensors: string | null;
}) {
  const type = await prisma.deviceType.findFirst({ select: { id: true } });
  return prisma.device.create({
    data: {
      deviceName: `Cabinet ${opts.serial}`,
      deviceType: type!.id,
      channelCount: 4,
      deviceId: opts.serial,
      gatewayDeviceId: `gw-${opts.serial}`,
      deviceStartDate: new Date(),
      createdAt: new Date(),
      assignedAdmin: opts.adminId,
      tenantId: opts.tenantId,
      assignSensor: opts.sensors,
      isOngoing: false,
      isDelete: "false_" as never,
      status: "one" as never,
    },
  });
}

let adminCookie = "";
let adminId = 0;
let adminTenantId = 0;
let otherCookie = "";
let otherId = 0;
let otherTenantId = 0;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { emailId: { in: ALL_EMAILS } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  const tenantIds = await tenantIdsFor(ids);

  const projects = await prisma.project.findMany({
    where: { createdBy: { in: ids } },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  await prisma.projectInvitation.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => {});
  await prisma.projectEmail.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } }).catch(() => {});
  await prisma.device.deleteMany({ where: { assignedAdmin: { in: ids } } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.subscription.deleteMany({ where: { adminId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await deleteEmptyTenants(tenantIds);
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();

  const admin = await registerAdmin(ADMIN_EMAIL);
  adminId = admin.userId;
  adminTenantId = admin.tenantId;
  adminCookie = await login(ADMIN_EMAIL);

  const other = await registerAdmin(OTHER_EMAIL);
  otherId = other.userId;
  otherTenantId = other.tenantId;
  otherCookie = await login(OTHER_EMAIL);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

function availableDevices(cookie: string) {
  return request(app)
    .get("/api/device")
    .query({ availableForProject: "1", limit: 100 })
    .set("Cookie", cookie);
}

function serialsOf(res: { body: { data?: { currentData?: unknown[] } } }) {
  const rows = (res.body.data?.currentData ?? []) as { deviceId: string }[];
  return rows.map((d) => d.deviceId);
}

describe("the devices a project may choose", () => {
  test("offers free devices that have sensors, and hides ones without", async () => {
    const withSensors = await makeDevice({
      serial: `ds-with-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });
    const withoutSensors = await makeDevice({
      serial: `ds-without-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: null,
    });

    const res = await availableDevices(adminCookie);
    expect(res.status).toBe(200);

    const serials = serialsOf(res);
    expect(serials).toContain(withSensors.deviceId);
    // No sensors means no readings; offering it would only produce the
    // "No sensor IDs found" refusal at submit time.
    expect(serials).not.toContain(withoutSensors.deviceId);
  });

  test("does not offer another organization's devices", async () => {
    const theirs = await makeDevice({
      serial: `ds-theirs-${Date.now()}`,
      adminId: otherId,
      tenantId: otherTenantId,
      sensors: "[1,2]",
    });

    const res = await availableDevices(adminCookie);
    expect(serialsOf(res)).not.toContain(theirs.deviceId);

    const theirRes = await availableDevices(otherCookie);
    expect(serialsOf(theirRes)).toContain(theirs.deviceId);
  });
});

describe("claiming a device", () => {
  test("a chosen device is stored on the project and marked in use", async () => {
    const device = await makeDevice({
      serial: `ds-claim-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });

    const created = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({
        projectName: `Device Claim ${Date.now()}`,
        projectLocation: "Kolkata",
        deviceId: String(device.id),
      });
    expect(created.status).toBe(200);

    const project = await prisma.project.findUnique({
      where: { id: created.body.projectId },
      select: { deviceId: true, sensorId: true },
    });
    expect(project?.deviceId).toBe(String(device.id));
    // The device's sensors are copied onto the project, as they always were.
    expect(project?.sensorId).toBe("[1,2]");

    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after?.isOngoing).toBe(true);

    // And it is no longer on offer.
    expect(serialsOf(await availableDevices(adminCookie))).not.toContain(
      device.deviceId,
    );
  });

  test("a device already on a live project is refused", async () => {
    const device = await makeDevice({
      serial: `ds-taken-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });

    const first = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({
        projectName: `Device Taken A ${Date.now()}`,
        projectLocation: "Kolkata",
        deviceId: String(device.id),
      });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({
        projectName: `Device Taken B ${Date.now()}`,
        projectLocation: "Kolkata",
        deviceId: String(device.id),
      });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already assigned|already in use/i);
  });

  test("a device with no sensors is refused even if asked for directly", async () => {
    const device = await makeDevice({
      serial: `ds-nosensor-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: null,
    });

    const res = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({
        projectName: `Device No Sensor ${Date.now()}`,
        projectLocation: "Kolkata",
        deviceId: String(device.id),
      });
    expect(res.status).toBe(400);

    // And the refusal left nothing half-done.
    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after?.isOngoing).toBe(false);
  });

  test("ending the project releases the device for reuse", async () => {
    const device = await makeDevice({
      serial: `ds-release-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });

    const created = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({
        projectName: `Device Release ${Date.now()}`,
        projectLocation: "Kolkata",
        deviceId: String(device.id),
      });
    expect(created.status).toBe(200);

    const ended = await request(app)
      .get(`/api/projectStart/${created.body.projectId}`)
      .query({ statusType: "end" })
      .set("Cookie", adminCookie);
    expect(ended.status).toBe(200);

    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after?.isOngoing).toBe(false);

    // Free again, so a new project may take it.
    expect(serialsOf(await availableDevices(adminCookie))).toContain(
      device.deviceId,
    );
  });
});

describe("serial numbers", () => {
  test("two devices cannot share one", async () => {
    const serial = `ds-unique-${Date.now()}`;
    await makeDevice({
      serial,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });

    await expect(
      makeDevice({ serial, adminId, tenantId: adminTenantId, sensors: "[1,2]" }),
    ).rejects.toThrow();
  });
});

describe("changing a project's device", () => {
  /** Creates a Not Started project holding the given device. */
  async function projectWith(device: { id: number }) {
    const res = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({
        projectName: `Device Swap ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        projectLocation: "Kolkata",
        deviceId: String(device.id),
      });
    expect(res.status).toBe(200);
    return res.body.projectId as number;
  }

  function setDevice(
    projectId: number,
    deviceId: string | null,
    cookie = adminCookie,
  ) {
    return request(app)
      .put(`/api/project/${projectId}/device`)
      .set("Cookie", cookie)
      .send({ deviceId });
  }

  test("swapping releases the old device and claims the new one", async () => {
    const oldDevice = await makeDevice({
      serial: `ds-swap-old-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });
    const newDevice = await makeDevice({
      serial: `ds-swap-new-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[7,8]",
    });

    const projectId = await projectWith(oldDevice);

    const res = await setDevice(projectId, String(newDevice.id));
    expect(res.status).toBe(200);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { deviceId: true, sensorId: true },
    });
    expect(project?.deviceId).toBe(String(newDevice.id));
    // The sensors travel with the device: the project reads whatever the
    // hardware now attached to it carries.
    expect(project?.sensorId).toBe("[7,8]");

    expect(
      (await prisma.device.findUnique({ where: { id: oldDevice.id } }))?.isOngoing,
    ).toBe(false);
    expect(
      (await prisma.device.findUnique({ where: { id: newDevice.id } }))?.isOngoing,
    ).toBe(true);
  });

  test("removing the device releases it and leaves the project with none", async () => {
    const device = await makeDevice({
      serial: `ds-detach-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });
    const projectId = await projectWith(device);

    const res = await setDevice(projectId, null);
    expect(res.status).toBe(200);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { deviceId: true, sensorId: true },
    });
    expect(project?.deviceId).toBeNull();
    expect(project?.sensorId).toBeNull();

    expect(
      (await prisma.device.findUnique({ where: { id: device.id } }))?.isOngoing,
    ).toBe(false);
  });

  test("is refused once the project is running", async () => {
    const device = await makeDevice({
      serial: `ds-running-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });
    const spare = await makeDevice({
      serial: `ds-running-spare-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[3,4]",
    });
    const projectId = await projectWith(device);

    const started = await request(app)
      .get(`/api/projectStart/${projectId}`)
      .query({ statusType: "start" })
      .set("Cookie", adminCookie);
    expect(started.status).toBe(200);

    const res = await setDevice(projectId, String(spare.id));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not started|before the project starts/i);

    // Nothing moved.
    expect(
      (await prisma.device.findUnique({ where: { id: device.id } }))?.isOngoing,
    ).toBe(true);
    expect(
      (await prisma.device.findUnique({ where: { id: spare.id } }))?.isOngoing,
    ).toBe(false);
  });

  test("is refused when the replacement is already claimed", async () => {
    const mine = await makeDevice({
      serial: `ds-busy-mine-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });
    const taken = await makeDevice({
      serial: `ds-busy-taken-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[3,4]",
    });

    const projectId = await projectWith(mine);
    await projectWith(taken); // claims it

    const res = await setDevice(projectId, String(taken.id));
    expect(res.status).toBe(400);

    // The project kept the device it had; nothing was released on the way to
    // a refusal.
    expect(
      (await prisma.project.findUnique({ where: { id: projectId } }))?.deviceId,
    ).toBe(String(mine.id));
    expect(
      (await prisma.device.findUnique({ where: { id: mine.id } }))?.isOngoing,
    ).toBe(true);
  });

  test("is refused when the replacement has no sensors", async () => {
    const mine = await makeDevice({
      serial: `ds-nos-mine-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });
    const bare = await makeDevice({
      serial: `ds-nos-bare-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: null,
    });

    const projectId = await projectWith(mine);

    const res = await setDevice(projectId, String(bare.id));
    expect(res.status).toBe(400);
    expect(
      (await prisma.device.findUnique({ where: { id: mine.id } }))?.isOngoing,
    ).toBe(true);
  });

  test("the options list covers only the project's own organization", async () => {
    const mine = await makeDevice({
      serial: `ds-opt-mine-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });
    const free = await makeDevice({
      serial: `ds-opt-free-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[3,4]",
    });
    const theirs = await makeDevice({
      serial: `ds-opt-theirs-${Date.now()}`,
      adminId: otherId,
      tenantId: otherTenantId,
      sensors: "[5,6]",
    });

    const projectId = await projectWith(mine);

    const res = await request(app)
      .get(`/api/project/${projectId}/device-options`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);

    const serials = (res.body.data ?? []).map(
      (d: { deviceId: string }) => d.deviceId,
    );
    expect(serials).toContain(free.deviceId);
    expect(serials).not.toContain(theirs.deviceId);
  });

  test("a contractor cannot change the device", async () => {
    const device = await makeDevice({
      serial: `ds-perm-${Date.now()}`,
      adminId,
      tenantId: adminTenantId,
      sensors: "[1,2]",
    });
    const projectId = await projectWith(device);

    const res = await setDevice(projectId, null, otherCookie);
    expect([403, 404]).toContain(res.status);
    expect(
      (await prisma.device.findUnique({ where: { id: device.id } }))?.isOngoing,
    ).toBe(true);
  });
});
