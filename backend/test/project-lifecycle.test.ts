import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import app from "../src/app";
import prisma from "../src/config/prisma";
import { TINY_PNG } from "./fixtures/registration";
import { deleteEmptyTenants, tenantIdsFor } from "./fixtures/tenants";

/**
 * The project lifecycle.
 *
 * The server accepted ANY transition from ANY state: a project could be paused
 * before it started, ended twice, or restarted after ending. The last is the
 * damaging one — ending releases the device and clears deviceId, so a restarted
 * project collects nothing and its device may already belong to another
 * project. Ending also emails the stakeholders, so an end/start/end cycle mails
 * them repeatedly.
 *
 *   not_start -> start
 *   start     -> pause, end
 *   pause     -> start (resume), end
 *   end       -> pause (reopen; paused, not running, because the device is gone)
 */

const ADMIN_EMAIL = "lc-admin@example.com";
const PASSWORD = "Password1!";

function cookieHeader(raw: unknown): string {
  const cookie = Array.isArray(raw) ? raw.join(";") : (raw as string);
  if (!cookie) throw new Error("No auth cookies returned");
  return cookie;
}

let adminCookie = "";
let adminId = 0;
let tenantId = 0;

async function cleanup() {
  const user = await prisma.user.findUnique({
    where: { emailId: ADMIN_EMAIL },
    select: { id: true },
  });
  if (!user) return;
  const tenantIds = await tenantIdsFor([user.id]);
  const projects = await prisma.project.findMany({
    where: { createdBy: user.id },
    select: { id: true, deviceId: true },
  });
  const ids = projects.map((p) => p.id);
  await prisma.projectInvitation.deleteMany({ where: { projectId: { in: ids } } }).catch(() => {});
  await prisma.projectEmail.deleteMany({ where: { projectId: { in: ids } } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.device.deleteMany({ where: { assignedAdmin: user.id } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.subscription.deleteMany({ where: { adminId: user.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await deleteEmptyTenants(tenantIds);
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanup();

  await request(app).post("/api/register/admin").send({
    companyName: `LC Org ${Date.now()}`,
    companyLogo: TINY_PNG,
    firstName: "LC",
    lastName: "Admin",
    emailId: ADMIN_EMAIL,
    phoneNo: "1234567890",
    password: PASSWORD,
  });
  const admin = await prisma.user.findUnique({ where: { emailId: ADMIN_EMAIL } });
  adminId = admin!.id;
  await prisma.user.update({
    where: { id: adminId },
    data: { isMailVerified: "true_", isUserVerified: "true_" },
  });
  tenantId = (await prisma.membership.findFirst({
    where: { userId: adminId },
    select: { tenantId: true },
  }))!.tenantId;

  const plan = await prisma.billingPlan.findFirst({
    where: { maxStructures: null },
    select: { id: true },
  });
  await prisma.subscription.upsert({
    where: { adminId },
    update: { planId: plan!.id, status: "active" },
    create: { adminId, planId: plan!.id, status: "active" },
  });

  const login = await request(app)
    .post("/api/commonLogin")
    .send({ username: ADMIN_EMAIL, password: PASSWORD });
  adminCookie = cookieHeader(login.headers["set-cookie"]);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function newProject(name: string): Promise<number> {
  const res = await request(app)
    .post("/api/project")
    .set("Cookie", adminCookie)
    .send({ projectName: `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, projectLocation: "Kolkata" });
  expect(res.status).toBe(200);
  return res.body.projectId;
}

function move(projectId: number, statusType: string, cookie = adminCookie) {
  return request(app)
    .get(`/api/projectStart/${projectId}`)
    .query({ statusType })
    .set("Cookie", cookie);
}

async function statusOf(projectId: number) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  return p?.status;
}

describe("legal transitions", () => {
  test("a new project starts, pauses, resumes and ends", async () => {
    const id = await newProject("LC Happy");
    expect(await statusOf(id)).toBe("not_start");

    expect((await move(id, "start")).status).toBe(200);
    expect(await statusOf(id)).toBe("start");

    expect((await move(id, "pause")).status).toBe(200);
    expect(await statusOf(id)).toBe("pause");

    // Resume is "start" again, from paused.
    expect((await move(id, "start")).status).toBe(200);
    expect(await statusOf(id)).toBe("start");

    expect((await move(id, "end")).status).toBe(200);
    expect(await statusOf(id)).toBe("end");
  });

  test("a paused project can be ended without resuming first", async () => {
    const id = await newProject("LC Pause End");
    await move(id, "start");
    await move(id, "pause");
    expect((await move(id, "end")).status).toBe(200);
    expect(await statusOf(id)).toBe("end");
  });

  test("an ended project reopens to paused, not to running", async () => {
    const id = await newProject("LC Reopen");
    await move(id, "start");
    await move(id, "end");

    expect((await move(id, "pause")).status).toBe(200);
    // Paused rather than running: ending released the device, so it must not
    // start collecting again until one is attached.
    expect(await statusOf(id)).toBe("pause");
  });
});

describe("illegal transitions are refused", () => {
  test("a project that never started cannot be paused", async () => {
    const id = await newProject("LC Early Pause");
    const res = await move(id, "pause");
    expect(res.status).toBe(400);
    expect(await statusOf(id)).toBe("not_start");
  });

  test("a project that never started cannot be ended", async () => {
    const id = await newProject("LC Early End");
    const res = await move(id, "end");
    expect(res.status).toBe(400);
    expect(await statusOf(id)).toBe("not_start");
  });

  test("an ended project cannot be restarted", async () => {
    const id = await newProject("LC No Restart");
    await move(id, "start");
    await move(id, "end");

    const res = await move(id, "start");
    expect(res.status).toBe(400);
    // The damaging one: ending cleared deviceId, so a restart would collect
    // nothing and the device may already be on another project.
    expect(await statusOf(id)).toBe("end");
  });

  test("an ended project cannot be ended again", async () => {
    const id = await newProject("LC Double End");
    await move(id, "start");
    await move(id, "end");

    const res = await move(id, "end");
    expect(res.status).toBe(400);
    // Ending emails the stakeholders; a second end would mail them again.
    expect(await statusOf(id)).toBe("end");
  });

  test("a running project cannot be started again", async () => {
    const id = await newProject("LC Double Start");
    await move(id, "start");
    const res = await move(id, "start");
    expect(res.status).toBe(400);
    expect(await statusOf(id)).toBe("start");
  });

  test("the refusal says what is wrong", async () => {
    const id = await newProject("LC Message");
    const res = await move(id, "pause");
    expect(res.body.message).toMatch(/not started|cannot|start/i);
  });
});

describe("ending releases the device", () => {
  test("the device is freed and can be taken by another project", async () => {
    const type = await prisma.deviceType.findFirst({ select: { id: true } });
    const device = await prisma.device.create({
      data: {
        deviceName: `LC Cabinet ${Date.now()}`,
        deviceType: type!.id,
        channelCount: 4,
        deviceId: `lc-${Date.now()}`,
        gatewayDeviceId: `gw-lc-${Date.now()}`,
        deviceStartDate: new Date(),
        createdAt: new Date(),
        assignedAdmin: adminId,
        tenantId,
        assignSensor: "[1,2]",
        isOngoing: false,
        isDelete: "false_" as never,
        status: "one" as never,
      },
    });

    const created = await request(app)
      .post("/api/project")
      .set("Cookie", adminCookie)
      .send({
        projectName: `LC Device ${Date.now()}`,
        projectLocation: "Kolkata",
        deviceId: String(device.id),
      });
    const id = created.body.projectId;
    expect((await prisma.device.findUnique({ where: { id: device.id } }))?.isOngoing).toBe(true);

    await move(id, "start");
    expect((await move(id, "end")).status).toBe(200);

    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after?.isOngoing).toBe(false);
    const project = await prisma.project.findUnique({
      where: { id },
      select: { deviceId: true },
    });
    expect(project?.deviceId).toBeNull();
  });
});
