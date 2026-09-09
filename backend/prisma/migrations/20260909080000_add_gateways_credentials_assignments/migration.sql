-- CreateEnum
CREATE TYPE "GatewayStatus" AS ENUM ('provisioning', 'active', 'degraded', 'offline', 'maintenance', 'decommissioned');

-- CreateEnum
CREATE TYPE "DeviceLifecycle" AS ENUM ('unregistered', 'provisioning', 'active', 'degraded', 'offline', 'maintenance', 'decommissioned');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "decommissionedAt" TIMESTAMP(3),
ADD COLUMN     "gatewayId" INTEGER,
ADD COLUMN     "lifecycle" "DeviceLifecycle" NOT NULL DEFAULT 'unregistered';

-- CreateTable
CREATE TABLE "gateways" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "gatewayKey" VARCHAR(128) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "projectId" INTEGER,
    "structureId" INTEGER,
    "locationId" INTEGER,
    "status" "GatewayStatus" NOT NULL DEFAULT 'provisioning',
    "firmwareVersion" VARCHAR(64),
    "hardwareModel" VARCHAR(120),
    "lastSeenAt" TIMESTAMP(3),
    "bufferedCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_credentials" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "keyId" VARCHAR(48) NOT NULL,
    "secretHash" VARCHAR(128) NOT NULL,
    "label" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "device_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_assignments" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "sensorId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "deviceId" INTEGER,
    "channelNumber" VARCHAR(32),
    "orientation" VARCHAR(64),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "sensor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_calibrations" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "sensorId" INTEGER NOT NULL,
    "calibrationValue" VARCHAR(64) NOT NULL,
    "zeroOffset" VARCHAR(64),
    "unit" VARCHAR(32),
    "manufacturer" VARCHAR(120),
    "model" VARCHAR(120),
    "serialNumber" VARCHAR(120),
    "rangeMin" VARCHAR(64),
    "rangeMax" VARCHAR(64),
    "accuracy" VARCHAR(64),
    "resolution" VARCHAR(64),
    "certificateRef" VARCHAR(160),
    "performedBy" VARCHAR(160),
    "performedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "sensor_calibrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gateways_publicId_key" ON "gateways"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "gateways_gatewayKey_key" ON "gateways"("gatewayKey");

-- CreateIndex
CREATE INDEX "gateways_tenantId_idx" ON "gateways"("tenantId");

-- CreateIndex
CREATE INDEX "gateways_tenantId_status_idx" ON "gateways"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "device_credentials_keyId_key" ON "device_credentials"("keyId");

-- CreateIndex
CREATE INDEX "device_credentials_deviceId_idx" ON "device_credentials"("deviceId");

-- CreateIndex
CREATE INDEX "device_credentials_tenantId_idx" ON "device_credentials"("tenantId");

-- CreateIndex
CREATE INDEX "sensor_assignments_sensorId_validFrom_idx" ON "sensor_assignments"("sensorId", "validFrom");

-- CreateIndex
CREATE INDEX "sensor_assignments_locationId_idx" ON "sensor_assignments"("locationId");

-- CreateIndex
CREATE INDEX "sensor_assignments_tenantId_idx" ON "sensor_assignments"("tenantId");

-- CreateIndex
CREATE INDEX "sensor_calibrations_sensorId_performedAt_idx" ON "sensor_calibrations"("sensorId", "performedAt");

-- CreateIndex
CREATE INDEX "sensor_calibrations_tenantId_idx" ON "sensor_calibrations"("tenantId");

-- CreateIndex
CREATE INDEX "devices_gatewayId_idx" ON "devices"("gatewayId");

-- CreateIndex
CREATE INDEX "devices_tenantId_lifecycle_idx" ON "devices"("tenantId", "lifecycle");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "gateways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_assignments" ADD CONSTRAINT "sensor_assignments_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_assignments" ADD CONSTRAINT "sensor_assignments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_calibrations" ADD CONSTRAINT "sensor_calibrations_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

