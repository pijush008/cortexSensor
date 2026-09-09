-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('superadmin', 'admin', 'contractor', 'authority');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('true_', 'false_');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('not_start', 'start', 'pause', 'end');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "YesNo" AS ENUM ('true_', 'false_');

-- CreateEnum
CREATE TYPE "ActiveOneZero" AS ENUM ('one', 'zero');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "userType" "UserRole" NOT NULL,
    "parentId" INTEGER NOT NULL DEFAULT 0,
    "firstName" VARCHAR(255) NOT NULL,
    "lastName" VARCHAR(255) NOT NULL,
    "emailId" VARCHAR(255) NOT NULL,
    "phoneNo" VARCHAR(255) NOT NULL,
    "isMailVerified" "YesNo" NOT NULL DEFAULT 'false_',
    "isUserVerified" "YesNo" NOT NULL DEFAULT 'false_',
    "password" VARCHAR(255) NOT NULL,
    "profileImage" TEXT,
    "status" "UserStatus" NOT NULL,
    "csv" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "isDelete" "YesNo" NOT NULL DEFAULT 'false_',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_types" (
    "id" SERIAL NOT NULL,
    "deviceType" VARCHAR(255) NOT NULL,
    "deviceImage" VARCHAR(255),
    "status" "ActiveOneZero" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "deviceName" VARCHAR(255) NOT NULL,
    "deviceType" INTEGER NOT NULL,
    "channelCount" INTEGER NOT NULL,
    "deviceId" VARCHAR(255),
    "gatewayDeviceId" VARCHAR(255) NOT NULL,
    "addedBy" INTEGER NOT NULL DEFAULT 0,
    "deviceStatus" "DeviceStatus" NOT NULL DEFAULT 'inactive',
    "deviceStartDate" TIMESTAMP(3) NOT NULL,
    "assignedAdmin" INTEGER,
    "assignSensor" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "status" "ActiveOneZero" NOT NULL DEFAULT 'one',
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3),
    "isDelete" "YesNo" NOT NULL DEFAULT 'false_',
    "updateHeartBeat" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "isOngoing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_channels" (
    "id" SERIAL NOT NULL,
    "deviceId" VARCHAR(255) NOT NULL,
    "channelNumber" VARCHAR(255) NOT NULL,
    "channelName" VARCHAR(255),
    "triggerValue" VARCHAR(255),
    "thresholdValue" VARCHAR(255),
    "assignSensor" VARCHAR(255),
    "activeStatus" "ActiveOneZero" NOT NULL DEFAULT 'zero',

    CONSTRAINT "device_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_types" (
    "id" SERIAL NOT NULL,
    "sensorType" VARCHAR(255) NOT NULL,
    "sensorIcon" VARCHAR(255) NOT NULL,
    "calibrationValue" VARCHAR(255) NOT NULL,
    "status" "ActiveOneZero" NOT NULL,
    "unit" VARCHAR(255),

    CONSTRAINT "sensor_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" SERIAL NOT NULL,
    "sensorName" VARCHAR(255) NOT NULL,
    "sensorTypeID" INTEGER NOT NULL,
    "assignedAdmin" INTEGER,
    "calibrationValue" VARCHAR(255),
    "unit" CHAR(255) NOT NULL,
    "status" "ActiveOneZero" NOT NULL DEFAULT 'one',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "projectName" VARCHAR(255) NOT NULL,
    "projectUniqueID" VARCHAR(512),
    "uniqueId" VARCHAR(50),
    "projectLocation" VARCHAR(255) NOT NULL,
    "startDate" DATE NOT NULL,
    "actualStartDate" DATE,
    "projectLogo" VARCHAR(255),
    "endDate" DATE,
    "contractorId" INTEGER,
    "authorityId" INTEGER,
    "deviceId" VARCHAR(255),
    "sensorId" TEXT,
    "dashImage" VARCHAR(255),
    "dashImage2" VARCHAR(255),
    "status" "ProjectStatus" NOT NULL DEFAULT 'not_start',
    "offset" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" INTEGER,
    "projectDevice" JSONB,
    "csvData" BOOLEAN DEFAULT false,
    "isDelete" BOOLEAN DEFAULT false,
    "isRegistered" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_data" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER,
    "deviceId" VARCHAR(255) NOT NULL,
    "sensorId" VARCHAR(255) NOT NULL,
    "sensorData" REAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sensor_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_data" (
    "id" SERIAL NOT NULL,
    "battery" INTEGER,
    "temperature" REAL NOT NULL,
    "humidity" REAL NOT NULL,
    "pressure" REAL NOT NULL,
    "gatewayDeviceId" VARCHAR(255),
    "deviceId" VARCHAR(255),
    "deviceName" VARCHAR(255),
    "projectName" VARCHAR(255),
    "deviceType" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "sensorDataId" INTEGER NOT NULL,
    "min" CHAR(255),
    "max" CHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_emails" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "isEnable" BOOLEAN NOT NULL DEFAULT true,
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "project_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firebase_tokens" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "status" "ActiveOneZero" NOT NULL DEFAULT 'one',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firebase_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temp_otps" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "otp" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temp_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entityId" INTEGER,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_emailId_key" ON "users"("emailId");

-- CreateIndex
CREATE INDEX "users_userType_idx" ON "users"("userType");

-- CreateIndex
CREATE INDEX "users_parentId_idx" ON "users"("parentId");

-- CreateIndex
CREATE INDEX "devices_assignedAdmin_idx" ON "devices"("assignedAdmin");

-- CreateIndex
CREATE INDEX "device_channels_deviceId_idx" ON "device_channels"("deviceId");

-- CreateIndex
CREATE INDEX "sensors_assignedAdmin_idx" ON "sensors"("assignedAdmin");

-- CreateIndex
CREATE INDEX "sensors_sensorTypeID_idx" ON "sensors"("sensorTypeID");

-- CreateIndex
CREATE INDEX "projects_createdBy_idx" ON "projects"("createdBy");

-- CreateIndex
CREATE INDEX "projects_contractorId_idx" ON "projects"("contractorId");

-- CreateIndex
CREATE INDEX "projects_authorityId_idx" ON "projects"("authorityId");

-- CreateIndex
CREATE INDEX "sensor_data_projectId_sensorId_createdAt_idx" ON "sensor_data"("projectId", "sensorId", "createdAt");

-- CreateIndex
CREATE INDEX "sensor_data_deviceId_createdAt_idx" ON "sensor_data"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "sensor_data_createdAt_idx" ON "sensor_data"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_sensorDataId_idx" ON "notifications"("sensorDataId");

-- CreateIndex
CREATE INDEX "project_emails_projectId_idx" ON "project_emails"("projectId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_deviceType_fkey" FOREIGN KEY ("deviceType") REFERENCES "device_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_assignedAdmin_fkey" FOREIGN KEY ("assignedAdmin") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_sensorTypeID_fkey" FOREIGN KEY ("sensorTypeID") REFERENCES "sensor_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_assignedAdmin_fkey" FOREIGN KEY ("assignedAdmin") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_data" ADD CONSTRAINT "sensor_data_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sensorDataId_fkey" FOREIGN KEY ("sensorDataId") REFERENCES "sensor_data"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_emails" ADD CONSTRAINT "project_emails_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firebase_tokens" ADD CONSTRAINT "firebase_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temp_otps" ADD CONSTRAINT "temp_otps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
