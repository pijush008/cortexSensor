import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEVICE_TYPES = [
  { deviceType: "Ackcio", deviceImage: null },
  { deviceType: "Device type 2", deviceImage: null },
  { deviceType: "Device type 3", deviceImage: null },
];

const SENSOR_TYPES = [
  { sensorType: "Temperature", sensorIcon: "uploads/sensors/1.png", calibrationValue: "1", unit: "°C" },
  { sensorType: "LVDT", sensorIcon: "uploads/sensors/2.png", calibrationValue: "1", unit: "mm" },
  { sensorType: "Accelerometer", sensorIcon: "uploads/sensors/3.png", calibrationValue: "1", unit: "m/s²" },
  { sensorType: "Strain Gauge", sensorIcon: "uploads/sensors/4.png", calibrationValue: "1", unit: "uS" },
  { sensorType: "Load Cell", sensorIcon: "uploads/sensors/5.png", calibrationValue: "1", unit: "uS" },
  { sensorType: "Inclinometer", sensorIcon: "uploads/sensors/6.png", calibrationValue: "1", unit: "°" },
  { sensorType: "Crack meter", sensorIcon: "uploads/sensors/7.png", calibrationValue: "1", unit: "mm" },
  { sensorType: "Torque Sensor", sensorIcon: "uploads/sensors/8.png", calibrationValue: "1", unit: "Nm" },
  { sensorType: "Humidity Sensor", sensorIcon: "uploads/sensors/9.png", calibrationValue: "1", unit: "%" },
];

async function seedReferenceData() {
  console.log("Seeding device types…");
  for (const dt of DEVICE_TYPES) {
    const existing = await prisma.deviceType.findFirst({
      where: { deviceType: dt.deviceType },
    });
    if (!existing) {
      await prisma.deviceType.create({
        data: { ...dt, status: "one" },
      });
    }
  }

  console.log("Seeding sensor types…");
  for (const st of SENSOR_TYPES) {
    const existing = await prisma.sensorType.findFirst({
      where: { sensorType: st.sensorType },
    });
    if (!existing) {
      await prisma.sensorType.create({
        data: { ...st, status: "one" },
      });
    }
  }
}

async function seedBillingPlans() {
  const PLANS = [
    {
      code: "complimentary",
      name: "Platform Owner Plan",
      priceMonthly: 0,
      currency: "INR",
      maxStructures: null,
      maxSensors: null,
      maxUsers: null,
      dataRetentionDays: null,
      apiAccess: true,
      smsAlerts: true,
      aiFeatures: true,
      advancedReports: true,
      femIntegration: true,
      sso: true,
    },
    {
      code: "starter",
      name: "Starter",
      priceMonthly: 499900, // ₹4,999
      currency: "INR",
      maxStructures: 3,
      maxSensors: 20,
      maxUsers: 5,
      dataRetentionDays: 30,
      apiAccess: false,
      smsAlerts: false,
      aiFeatures: false,
      advancedReports: false,
      femIntegration: false,
      sso: false,
    },
    {
      code: "professional",
      name: "Professional",
      priceMonthly: 1499900, // ₹14,999
      currency: "INR",
      maxStructures: 20,
      maxSensors: 200,
      maxUsers: 25,
      dataRetentionDays: 365,
      apiAccess: true,
      smsAlerts: true,
      aiFeatures: true,
      advancedReports: true,
      femIntegration: false,
      sso: false,
    },
    {
      code: "enterprise",
      name: "Enterprise",
      priceMonthly: 0, // custom / quoted
      currency: "INR",
      maxStructures: null,
      maxSensors: null,
      maxUsers: null,
      dataRetentionDays: null,
      apiAccess: true,
      smsAlerts: true,
      aiFeatures: true,
      advancedReports: true,
      femIntegration: true,
      sso: true,
    },
  ];

  console.log("Seeding billing plans…");
  for (const plan of PLANS) {
    await prisma.billingPlan.upsert({
      where: { code: plan.code },
      update: { ...plan },
      create: { ...plan },
    });
  }

  // Existing admins without a subscription get a trial on Starter.
  console.log("Backfilling subscriptions for existing admins…");
  const admins = await prisma.user.findMany({
    where: { userType: "admin", isDelete: "false_" as never },
    select: { id: true },
  });
  const starter = await prisma.billingPlan.findUnique({
    where: { code: "starter" },
  });
  if (starter) {
    for (const admin of admins) {
      await prisma.subscription.upsert({
        where: { adminId: admin.id },
        update: {},
        create: {
          adminId: admin.id,
          planId: starter.id,
          status: "trial",
          startsOn: new Date(),
          renewsOn: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }
}

async function main() {
  await seedReferenceData();
  await seedBillingPlans();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());