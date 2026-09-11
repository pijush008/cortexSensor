/**
 * DEVELOPMENT FIXTURE — one project wired end to end for the project dashboard.
 *
 * The dashboard at /projects/:id/dashboard resolves a project by its uniqueId
 * and renders the channels of the device attached to it. No project in a fresh
 * database has either, so the page has nothing to draw and cannot be exercised.
 * This creates that wiring.
 *
 *   npm run seed:demo-project
 *
 * It seeds CONFIGURATION only — a project, a device, two channels and the two
 * sensors they carry. It writes no measurements, alerts or analyses: those come
 * from the real ingest and analysis paths, and inventing readings here would put
 * fabricated engineering data into the product through the back door. The
 * dashboard therefore shows its channels with "No Data Available" until real
 * telemetry arrives, which is the honest state.
 *
 * Same guard as seed-demo-users.ts: it must be asked for by name and refuses to
 * run unless the operator confirms this is a development database.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_SLUG = "demo-infrastructure";
const PROJECT_NAME = "Demo Flyover Dashboard";
/** Looked up by the dashboard endpoint, so it must be stable and non-empty. */
const PROJECT_UNIQUE_ID = "demo-flyover-01";
const GATEWAY_DEVICE_ID = "demo-gw-01";

/**
 * The channels to wire up. The dashboard renders one card per ACTIVE channel,
 * so the count is settable — `CHANNELS=4 npm run seed:demo-project` is how the
 * 1-channel and 4-channel layouts get exercised for real rather than by eye.
 */
const CHANNEL_POOL = [
  {
    channelNumber: "1",
    channelName: "Load Cell",
    sensorName: "Load Cell",
    sensorTypeName: "Load Cell",
    unit: "uS",
    thresholdValue: "85",
    triggerValue: "45",
  },
  {
    channelNumber: "2",
    channelName: "LVDT",
    sensorName: "LVDT",
    sensorTypeName: "LVDT",
    unit: "mm",
    thresholdValue: "96",
    triggerValue: "25",
  },
  {
    channelNumber: "3",
    channelName: "Tiltmeter",
    sensorName: "Tiltmeter",
    sensorTypeName: "Tiltmeter",
    unit: "deg",
    thresholdValue: "12",
    triggerValue: "5",
  },
  {
    channelNumber: "4",
    channelName: "Thermocouple",
    sensorName: "Thermocouple",
    sensorTypeName: "Thermocouple",
    unit: "C",
    thresholdValue: "70",
    triggerValue: "40",
  },
];

const CHANNEL_COUNT = Math.min(
  Math.max(Number(process.env.CHANNELS ?? 2), 1),
  CHANNEL_POOL.length,
);

const CHANNELS = CHANNEL_POOL.slice(0, CHANNEL_COUNT);

async function main() {
  if (process.env.ALLOW_DEMO_DATA !== "true") {
    console.error(
      "Refusing to run: this writes demo records into the database.\n" +
        "Set ALLOW_DEMO_DATA=true to confirm this is a development database.",
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    console.error(
      `Tenant "${TENANT_SLUG}" is missing. Run \`npm run seed:demo-users\` first.`,
    );
    process.exit(1);
  }

  const owner = await prisma.user.findFirst({
    where: {
      isPlatformAdmin: false,
      memberships: { some: { tenantId: tenant.id } },
    },
    select: { id: true, emailId: true },
  });
  if (!owner) {
    console.error(
      `No member of "${TENANT_SLUG}" exists. Run \`npm run seed:demo-users\` first.`,
    );
    process.exit(1);
  }

  // Device type and sensor types are reference data from the main seed; reuse
  // whatever is there rather than inventing a second set.
  const deviceType = await prisma.deviceType.findFirst({ select: { id: true } });
  if (!deviceType) {
    console.error("No device types exist. Run `npm run prisma:seed` first.");
    process.exit(1);
  }

  const existingDevice = await prisma.device.findFirst({
    where: { gatewayDeviceId: GATEWAY_DEVICE_ID },
  });
  const device = existingDevice
    ? await prisma.device.update({
        where: { id: existingDevice.id },
        data: { channelCount: CHANNELS.length, isOngoing: true },
      })
    : await prisma.device.create({
        data: {
          tenantId: tenant.id,
          deviceName: "Demo Cabinet",
          deviceType: deviceType.id,
          channelCount: CHANNELS.length,
          gatewayDeviceId: GATEWAY_DEVICE_ID,
          deviceId: GATEWAY_DEVICE_ID,
          deviceStartDate: new Date(),
          createdAt: new Date(),
          assignedAdmin: owner.id,
          isOngoing: true,
        },
      });

  const sensorIds: number[] = [];

  for (const spec of CHANNELS) {
    const sensorType =
      (await prisma.sensorType.findFirst({
        where: { sensorType: spec.sensorTypeName },
      })) ??
      (await prisma.sensorType.create({
        data: {
          sensorType: spec.sensorTypeName,
          sensorIcon: "",
          calibrationValue: "1",
          status: "one",
          unit: spec.unit,
        },
      }));

    const existingSensor = await prisma.sensor.findFirst({
      where: { sensorName: spec.sensorName, tenantId: tenant.id },
    });
    const sensor = existingSensor
      ? await prisma.sensor.update({
          where: { id: existingSensor.id },
          data: {
            sensorTypeID: sensorType.id,
            unit: spec.unit,
            assignedAdmin: owner.id,
          },
        })
      : await prisma.sensor.create({
          data: {
            tenantId: tenant.id,
            sensorName: spec.sensorName,
            sensorTypeID: sensorType.id,
            unit: spec.unit,
            calibrationValue: "1",
            assignedAdmin: owner.id,
          },
        });
    sensorIds.push(sensor.id);

    const existing = await prisma.deviceChannel.findFirst({
      where: { deviceId: String(device.id), channelNumber: spec.channelNumber },
    });
    const data = {
      deviceId: String(device.id),
      channelNumber: spec.channelNumber,
      channelName: spec.channelName,
      thresholdValue: spec.thresholdValue,
      triggerValue: spec.triggerValue,
      assignSensor: String(sensor.id),
      activeStatus: "one" as const,
    };
    if (existing) {
      await prisma.deviceChannel.update({ where: { id: existing.id }, data });
    } else {
      await prisma.deviceChannel.create({ data });
    }
  }

  // Rows from a previous run with a larger CHANNELS value are switched off
  // rather than deleted, so their history survives and the dashboard — which
  // renders one card per ACTIVE channel — stops showing them.
  await prisma.deviceChannel.updateMany({
    where: {
      deviceId: String(device.id),
      channelNumber: { notIn: CHANNELS.map((c) => c.channelNumber) },
    },
    data: { activeStatus: "zero" },
  });

  await prisma.device.update({
    where: { id: device.id },
    data: { assignSensor: JSON.stringify(sensorIds) },
  });

  const existingProject = await prisma.project.findFirst({
    where: { uniqueId: PROJECT_UNIQUE_ID },
  });

  const projectData = {
    tenantId: tenant.id,
    projectName: PROJECT_NAME,
    projectUniqueID: "DEMO-FLYOVER-01",
    uniqueId: PROJECT_UNIQUE_ID,
    projectLocation: "Delhi",
    startDate: new Date(),
    actualStartDate: new Date(),
    // An end date is REQUIRED for ingest, not merely descriptive: the IoT
    // path's isTodayBetweenOrEqualTo() returns false when endDate is null, so
    // an open-ended project silently rejects every reading with "Project is
    // not currently running". A year out keeps the fixture ingesting.
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    status: "start" as const,
    createdBy: owner.id,
    deviceId: String(device.id),
    sensorId: JSON.stringify(sensorIds),
    // The dashboard endpoint filters on both; without them it will not resolve.
    isRegistered: true,
    isDelete: false,
  };

  const project = existingProject
    ? await prisma.project.update({
        where: { id: existingProject.id },
        data: projectData,
      })
    : await prisma.project.create({ data: projectData });

  console.log(`Project  ${project.projectName} (id ${project.id})`);
  console.log(`uniqueId ${project.uniqueId}`);
  console.log(`Device   ${device.deviceName} (id ${device.id})`);
  console.log(`Channels ${CHANNELS.map((c) => c.channelName).join(", ")}`);
  console.log(`Owner    ${owner.emailId}`);
  console.log(`\nDashboard: /projects/${project.id}/dashboard`);
  console.log("Development fixture only — never load this into production.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
