import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import prisma from "../src/config/prisma";
import { createNetworkDataFromDevice } from "../src/modules/iot/iot.service";

/**
 * The project's status decides whether readings are kept.
 *
 * Start collects, pause suspends, end stops — and every row is stored against
 * the project it belongs to.
 *
 * Ingestion used to be gated on a CALENDAR WINDOW instead, which made the
 * controls misleading in both directions: pausing a project kept collecting,
 * and a started project whose planned dates had passed silently dropped
 * everything with no visible reason. Ending appeared to work only by accident —
 * it clears deviceId, so the device-to-project lookup stopped finding anything.
 * That accident stopped being sufficient once a project could be reopened,
 * because a reopened project sits paused with no device.
 *
 * Payloads are always ACKNOWLEDGED, never errored, whatever the status: a
 * rejected payload makes a field gateway retry the same data forever.
 */

const GATEWAY = `gw-gate-${Date.now()}`;
const DEVICE_KEY = `dev-gate-${Date.now()}`;
const ADMIN_EMAIL = "gate-admin@example.com";

let deviceRowId = 0;
let projectId = 0;
let sensorId = 0;
let adminId = 0;
let tenantId = 0;

function payload(reading: number) {
  return {
    Type: "SensorData",
    Telemetries: [
      {
        GatewayDeviceId: GATEWAY,
        DeviceId: DEVICE_KEY,
        DeviceName: "Gate Node",
        ProjectName: "Gate Project",
        Timestamp: Math.floor(Date.now() / 1000),
        Sensor: { SensorType: "Strain", Channels: [{ RawReading: reading }] },
      },
    ],
  };
}

async function rowCount() {
  return prisma.sensorData.count({ where: { projectId } });
}

async function setStatus(status: string) {
  await prisma.project.update({
    where: { id: projectId },
    data: { status: status as never },
  });
}

beforeAll(async () => {
  await prisma.$connect();

  const admin = await prisma.user.create({
    data: {
      userType: "admin",
      firstName: "Gate",
      lastName: "Admin",
      emailId: ADMIN_EMAIL,
      phoneNo: "9000000000",
      password: "x",
      status: "true_" as never,
      isMailVerified: "true_" as never,
      isUserVerified: "true_" as never,
      isDelete: "false_" as never,
    },
  });
  adminId = admin.id;

  const tenant = await prisma.tenant.create({
    data: {
      publicId: `gate${Date.now()}`.slice(0, 30),
      name: `Gate Org ${Date.now()}`,
      slug: `gate-org-${Date.now()}`,
      status: "active",
    },
  });
  tenantId = tenant.id;

  // handleSensorData only stores readings for sensor families it knows how to
  // interpret — strain, load cell, wheatstone, potentiometer, LVDT. A
  // Temperature sensor would be accepted and silently skipped.
  const sensorType = await prisma.sensorType.findFirst({
    where: { sensorType: { contains: "Strain", mode: "insensitive" } },
    select: { id: true },
  });
  expect(sensorType, "expected a strain sensor type to be seeded").toBeTruthy();
  const sensor = await prisma.sensor.create({
    data: {
      sensorName: `Gate Sensor ${Date.now()}`,
      sensorTypeID: sensorType!.id,
      assignedAdmin: adminId,
      tenantId,
      unit: "microstrain",
      status: "one" as never,
      createdAt: new Date(),
    },
  });
  sensorId = sensor.id;

  const deviceType = await prisma.deviceType.findFirst({ select: { id: true } });
  const device = await prisma.device.create({
    data: {
      deviceName: "Gate Cabinet",
      deviceType: deviceType!.id,
      channelCount: 1,
      deviceId: DEVICE_KEY,
      gatewayDeviceId: GATEWAY,
      deviceStartDate: new Date(),
      createdAt: new Date(),
      assignedAdmin: adminId,
      tenantId,
      assignSensor: `[${sensorId}]`,
      isOngoing: true,
      isDelete: "false_" as never,
      status: "one" as never,
    },
  });
  deviceRowId = device.id;

  // handleSensorData maps each incoming channel reading to a DeviceChannel by
  // position, and skips any channel with no sensor assigned. Without this row
  // the payload is accepted and silently stores nothing.
  await prisma.deviceChannel.create({
    data: {
      deviceId: String(device.id),
      channelNumber: "1",
      channelName: "CH1",
      assignSensor: String(sensorId),
      activeStatus: "one" as never,
    } as never,
  });

  // recordHeartbeat updates an existing gateway rather than creating one, so
  // the row has to exist for liveness to be observable at all.
  await prisma.gateway.create({
    data: {
      publicId: `gw${Date.now()}`.slice(0, 30),
      gatewayKey: GATEWAY,
      name: "Gate Gateway",
      tenantId,
      status: "active" as never,
    } as never,
  });

  // Planned dates deliberately in the PAST: with status as the gate, a started
  // project collects regardless of them.
  const project = await prisma.project.create({
    data: {
      projectName: `Gate Project ${Date.now()}`,
      projectLocation: "Kolkata",
      startDate: new Date("2020-01-01"),
      endDate: new Date("2020-02-01"),
      tenantId,
      createdBy: adminId,
      deviceId: String(device.id),
      sensorId: `[${sensorId}]`,
      status: "not_start",
      isDelete: false,
      isRegistered: true,
      offset: 0,
      csvData: false,
      uniqueId: `gate${Date.now()}`.slice(0, 20),
    },
  });
  projectId = project.id;
});

afterAll(async () => {
  await prisma.measurement.deleteMany({ where: { projectId } }).catch(() => {});
  await prisma.notification.deleteMany({
    where: { sensorData: { projectId } },
  }).catch(() => {});
  await prisma.sensorData.deleteMany({ where: { projectId } }).catch(() => {});
  await prisma.deviceChannel.deleteMany({ where: { deviceId: String(deviceRowId) } }).catch(() => {});
  await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => {});
  await prisma.device.deleteMany({ where: { id: deviceRowId } }).catch(() => {});
  await prisma.sensor.deleteMany({ where: { id: sensorId } }).catch(() => {});
  await prisma.gateway.deleteMany({ where: { gatewayKey: GATEWAY } }).catch(() => {});
  await prisma.membership.deleteMany({ where: { userId: adminId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.measurement.deleteMany({ where: { projectId } }).catch(() => {});
  // Notifications reference sensor_data with ON DELETE RESTRICT, so they are
  // cleared FIRST. Left to last, the reading they point at cannot be deleted
  // and every later test inherits the previous one's rows.
  await prisma.notification.deleteMany({
    where: { sensorData: { projectId } },
  }).catch(() => {});
  await prisma.sensorData.deleteMany({ where: { projectId } });
});

describe("collection follows the project's status", () => {
  test("a started project stores readings against its own project id", async () => {
    await setStatus("start");
    const res = await createNetworkDataFromDevice(payload(123.45) as never);

    expect(res.status_code).toBe(200);
    expect(await rowCount()).toBe(1);

    const row = await prisma.sensorData.findFirst({ where: { projectId } });
    expect(row?.projectId).toBe(projectId);
    expect(row?.sensorData).toBeCloseTo(123.45, 2);
  });

  test("planned dates in the past do not stop a started project", async () => {
    // The project's window is 2020; status is what decides.
    await setStatus("start");
    await createNetworkDataFromDevice(payload(1) as never);
    expect(await rowCount()).toBe(1);
  });

  test("a paused project stores nothing", async () => {
    await setStatus("pause");
    const res = await createNetworkDataFromDevice(payload(50) as never);

    // Acknowledged, not errored: a refused payload makes the gateway retry the
    // same reading indefinitely.
    expect(res.status_code).toBe(200);
    expect(await rowCount()).toBe(0);
  });

  test("a project that has not started stores nothing", async () => {
    await setStatus("not_start");
    await createNetworkDataFromDevice(payload(7) as never);
    expect(await rowCount()).toBe(0);
  });

  test("an ended project stores nothing, device released or not", async () => {
    await setStatus("end");
    await createNetworkDataFromDevice(payload(9) as never);
    expect(await rowCount()).toBe(0);
  });

  test("resuming collects again", async () => {
    await setStatus("pause");
    await createNetworkDataFromDevice(payload(1) as never);
    expect(await rowCount()).toBe(0);

    await setStatus("start");
    await createNetworkDataFromDevice(payload(2) as never);
    expect(await rowCount()).toBe(1);
  });
});

describe("a reading lands on the channel the firmware meant", () => {
  /**
   * The payload's Channels array is positional: reading 0 is channel 1.
   *
   * The lookup that maps them had no ORDER BY, so the pairing depended on the
   * order Postgres happened to return rows in — observed as 4, 1, 2, 3 on a
   * real device. Every reading was attributed to the wrong sensor: values that
   * looked entirely reasonable, recorded against the wrong instrument, with
   * nothing in the logs to suggest it.
   */
  test("reading 0 goes to channel 1, not to whichever row came back first", async () => {
    await setStatus("start");

    // A second channel, created AFTER the first so its row id is higher, but
    // numbered LOWER. Sorted by id it comes second; sorted by channel number it
    // comes first. Only the correct ordering puts the reading on it.
    const extra = await prisma.deviceChannel.create({
      data: {
        deviceId: String(deviceRowId),
        channelNumber: "0",
        channelName: "CH0",
        assignSensor: String(sensorId),
        activeStatus: "one" as never,
      } as never,
    });

    try {
      await createNetworkDataFromDevice(payload(42.5) as never);

      const rows = await prisma.sensorData.findMany({ where: { projectId } });
      // One reading in, one row out — and it belongs to the sensor on the
      // lowest-numbered channel.
      expect(rows).toHaveLength(1);
      expect(rows[0].sensorData).toBeCloseTo(42.5, 2);
    } finally {
      await prisma.deviceChannel.delete({ where: { id: extra.id } });
    }
  });
});

describe("collection follows the channel's selection", () => {
  /**
   * An administrator selects which channels are in use. An unselected one is a
   * socket nobody is recording — often nothing is even wired to it.
   *
   * Nothing enforced this before: `activeStatus` was shown in the console and
   * settable nowhere, so a channel displayed as Inactive went on storing
   * readings and raising alerts exactly like an active one. These assert the
   * rule at BOTH ends, because a half-applied version — no history but alerts
   * still firing — would be worse than either.
   */
  const setChannel = (active: boolean) =>
    prisma.deviceChannel.updateMany({
      where: { deviceId: String(deviceRowId) },
      data: { activeStatus: (active ? "one" : "zero") as never },
    });

  test("a selected channel stores its reading", async () => {
    await setStatus("start");
    await setChannel(true);

    const res = await createNetworkDataFromDevice(payload(77.7) as never);
    expect(res.status_code).toBe(200);
    expect(await rowCount()).toBe(1);
  });

  test("an unselected channel stores nothing", async () => {
    await setStatus("start");
    await setChannel(false);

    const res = await createNetworkDataFromDevice(payload(77.7) as never);
    // Acknowledged, not errored: a refused payload makes the gateway retry the
    // same reading forever.
    expect(res.status_code).toBe(200);
    expect(await rowCount()).toBe(0);
  });

  /**
   * The alert half of the rule, with a POSITIVE CONTROL.
   *
   * The fixture channel carries no threshold, so an "unselected raises no
   * alert" assertion on its own passes whether or not the rule works — it was
   * written that way first and proved nothing. Setting a threshold, showing an
   * alert DOES fire when the channel is selected, and only then showing it does
   * not when unselected, is what makes the second assertion mean something.
   */
  const withThreshold = () =>
    prisma.deviceChannel.updateMany({
      where: { deviceId: String(deviceRowId) },
      data: { triggerValue: "10", thresholdValue: "20" },
    });

  test("a selected channel over its threshold DOES raise an alert", async () => {
    await setStatus("start");
    await withThreshold();
    await setChannel(true);

    const before = await prisma.notification.count();
    await createNetworkDataFromDevice(payload(999) as never);
    expect(await prisma.notification.count()).toBeGreaterThan(before);
  });

  test("an unselected channel over its threshold raises none", async () => {
    await setStatus("start");
    await withThreshold();
    await setChannel(false);

    const before = await prisma.notification.count();
    await createNetworkDataFromDevice(payload(999) as never);
    expect(await prisma.notification.count()).toBe(before);
  });

  test("selection is independent of the project's status", async () => {
    // A selected channel on a paused project still stores nothing: the two
    // gates are separate, and either one closing is enough.
    await setStatus("pause");
    await setChannel(true);
    await createNetworkDataFromDevice(payload(5) as never);
    expect(await rowCount()).toBe(0);
  });

  afterAll(async () => {
    // Leave the fixture as the other suites expect to find it.
    await setChannel(true);
    await prisma.deviceChannel.updateMany({
      where: { deviceId: String(deviceRowId) },
      data: { triggerValue: null, thresholdValue: null },
    });
  });
});

describe("gateway liveness is never gated", () => {
  test("a heartbeat is recorded even while the project is paused", async () => {
    await setStatus("pause");
    await createNetworkDataFromDevice(payload(3) as never);

    // An installer at a roadside cabinet must be able to tell a live unit from
    // a dead one without a running project.
    const gateway = await prisma.gateway.findFirst({
      where: { gatewayKey: GATEWAY },
      select: { lastSeenAt: true },
    });
    expect(gateway?.lastSeenAt).toBeTruthy();
  });
});
