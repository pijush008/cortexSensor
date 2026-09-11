import { afterAll, beforeAll, describe, expect, test } from "vitest";
import prisma from "../src/config/prisma";
import { createProject } from "../src/modules/projects/projects.service";

/**
 * The project's visible identifier.
 *
 * Three rules, all of which were broken before:
 *   - it is ISSUED BY THE SERVER on creation, never chosen by the caller;
 *   - it is unique;
 *   - it never changes, because it is quoted in reports, correspondence and
 *     URLs, and an edit that rewrote it would invalidate every reference.
 *
 * The old create path took projectUniqueID straight from the request body and
 * the update path overwrote it with whatever was sent, so two projects could
 * carry the same code and a code could change under the people using it.
 */

const SUFFIX = Date.now();
let tenantId = 0;
let adminId = 0;
let deviceId = 0;
const created: number[] = [];

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: {
      publicId: `tn_pid_${SUFFIX}`,
      name: "PID Co",
      slug: `pid-co-${SUFFIX}`,
      status: "active",
    },
  });
  tenantId = tenant.id;

  const admin = await prisma.user.create({
    data: {
      emailId: `pid-admin-${SUFFIX}@example.com`,
      firstName: "Alice",
      lastName: "Admin",
      phoneNo: "0000000000",
      password: "x",
      userType: "admin",
      status: "true_",
      isDelete: "false_",
    },
  });
  adminId = admin.id;

  // The update path refuses a project with no sensors, so the immutability
  // test needs a project that has a device behind it.
  const sensorType = await prisma.sensorType.findFirst();
  if (!sensorType) throw new Error("Reference sensor types are not seeded");
  const sensor = await prisma.sensor.create({
    data: {
      tenantId,
      sensorName: `PID Sensor ${SUFFIX}`,
      sensorTypeID: sensorType.id,
      unit: "uS",
    },
  });
  const deviceType = await prisma.deviceType.findFirst();
  if (!deviceType) throw new Error("Reference device types are not seeded");
  const device = await prisma.device.create({
    data: {
      tenantId,
      deviceName: `PID Device ${SUFFIX}`,
      deviceType: deviceType.id,
      channelCount: 1,
      gatewayDeviceId: `pid-gw-${SUFFIX}`,
      deviceId: `pid-gw-${SUFFIX}`,
      deviceStartDate: new Date(),
      createdAt: new Date(),
      assignSensor: JSON.stringify([sensor.id]),
    },
  });
  deviceId = device.id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.device.deleteMany({ where: { tenantId } });
  await prisma.sensor.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
});

async function makeProject(name: string, extra: Record<string, unknown> = {}) {
  const res = (await createProject(
    {
      projectName: name,
      projectLocation: "Delhi",
      createdBy: String(adminId),
      ...extra,
    } as never,
    tenantId,
  )) as { projectId: number; projectUniqueID?: string };
  created.push(res.projectId);
  return res;
}

describe("project identifier", () => {
  test("is generated on creation without the caller supplying one", async () => {
    const res = await makeProject(`PID One ${SUFFIX}`);
    const row = await prisma.project.findUnique({ where: { id: res.projectId } });

    expect(row?.projectUniqueID).toBeTruthy();
    // Admin only: with no contractor or authority those segments are omitted
    // rather than padded, so the code never implies a party that is not there.
    expect(row!.projectUniqueID!).toMatch(/^CGSL\/ALI\/\d{4}\/\d{4}-\d{2}\/\d{4}$/);
  });

  test("ignores a projectUniqueID supplied by the caller", async () => {
    const res = await makeProject(`PID Two ${SUFFIX}`, {
      projectUniqueID: "ATTACKER-CHOSEN-ID",
    });
    const row = await prisma.project.findUnique({ where: { id: res.projectId } });

    expect(row?.projectUniqueID).not.toBe("ATTACKER-CHOSEN-ID");
    expect(row?.projectUniqueID).toMatch(/^CGSL\//);
  });

  test("is unique across projects", async () => {
    const a = await makeProject(`PID Three ${SUFFIX}`);
    const b = await makeProject(`PID Four ${SUFFIX}`);
    const rows = await prisma.project.findMany({
      where: { id: { in: [a.projectId, b.projectId] } },
      select: { projectUniqueID: true },
    });
    expect(rows[0].projectUniqueID).not.toBe(rows[1].projectUniqueID);
  });

  test("cannot be changed by an update", async () => {
    const res = await makeProject(`PID Five ${SUFFIX}`, { deviceId: String(deviceId) });
    const before = await prisma.project.findUnique({ where: { id: res.projectId } });

    // The update path is createProject with an existing projectId.
    await createProject(
      {
        projectId: String(res.projectId),
        projectName: `PID Five Renamed ${SUFFIX}`,
        projectLocation: "Mumbai",
        projectUniqueID: "SOMETHING-ELSE",
      } as never,
      tenantId,
    );

    const after = await prisma.project.findUnique({ where: { id: res.projectId } });
    expect(after?.projectUniqueID).toBe(before?.projectUniqueID);
    expect(after?.projectName).toBe(`PID Five Renamed ${SUFFIX}`);
  });
});
