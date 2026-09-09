-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'investigating', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('structural', 'sensor_health', 'connectivity', 'data_quality');

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sensorId" INTEGER,
    "structureId" INTEGER,
    "category" "AlertCategory" NOT NULL DEFAULT 'structural',
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "consecutiveSamples" INTEGER NOT NULL DEFAULT 3,
    "renotifyAfterMinutes" INTEGER NOT NULL DEFAULT 60,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "ruleId" INTEGER,
    "sensorId" INTEGER,
    "deviceId" INTEGER,
    "gatewayId" INTEGER,
    "locationId" INTEGER,
    "structureId" INTEGER,
    "projectId" INTEGER,
    "category" "AlertCategory" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "title" VARCHAR(200) NOT NULL,
    "evidence" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "dedupeKey" VARCHAR(200) NOT NULL,
    "detectedAt" TIMESTAMPTZ NOT NULL,
    "lastObservedAt" TIMESTAMPTZ NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "lastNotifiedAt" TIMESTAMP(3),
    "assignedToId" INTEGER,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" INTEGER,
    "closedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" SERIAL NOT NULL,
    "alertId" INTEGER NOT NULL,
    "fromStatus" "AlertStatus",
    "toStatus" "AlertStatus" NOT NULL,
    "note" TEXT,
    "actorId" INTEGER,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_publicId_key" ON "alert_rules"("publicId");

-- CreateIndex
CREATE INDEX "alert_rules_tenantId_isEnabled_idx" ON "alert_rules"("tenantId", "isEnabled");

-- CreateIndex
CREATE INDEX "alert_rules_sensorId_idx" ON "alert_rules"("sensorId");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_publicId_key" ON "alerts"("publicId");

-- CreateIndex
CREATE INDEX "alerts_tenantId_status_severity_idx" ON "alerts"("tenantId", "status", "severity");

-- CreateIndex
CREATE INDEX "alerts_tenantId_detectedAt_idx" ON "alerts"("tenantId", "detectedAt");

-- CreateIndex
CREATE INDEX "alerts_sensorId_detectedAt_idx" ON "alerts"("sensorId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_dedupeKey_status_key" ON "alerts"("dedupeKey", "status");

-- CreateIndex
CREATE INDEX "alert_events_alertId_createdAt_idx" ON "alert_events"("alertId", "createdAt");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

