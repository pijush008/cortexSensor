-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('routine', 'triggered', 'post_event', 'commissioning', 'decommissioning');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('no_action_required', 'monitor', 'repair_recommended', 'urgent_action_required', 'inconclusive');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('queued', 'generating', 'ready', 'failed');

-- CreateTable
CREATE TABLE "inspections" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "structureId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "alertId" INTEGER,
    "type" "InspectionType" NOT NULL DEFAULT 'routine',
    "outcome" "InspectionOutcome" NOT NULL DEFAULT 'monitor',
    "performedAt" TIMESTAMPTZ NOT NULL,
    "inspectorName" VARCHAR(160) NOT NULL,
    "inspectorOrg" VARCHAR(160),
    "observations" TEXT NOT NULL,
    "recommendation" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "environmentalContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_photos" (
    "id" SERIAL NOT NULL,
    "inspectionId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "caption" VARCHAR(500),
    "contentType" VARCHAR(120),
    "byteSize" INTEGER,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "structureId" INTEGER,
    "title" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ReportStatus" NOT NULL DEFAULT 'queued',
    "periodFrom" TIMESTAMPTZ NOT NULL,
    "periodTo" TIMESTAMPTZ NOT NULL,
    "content" JSONB,
    "storageKey" VARCHAR(512),
    "error" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inspections_publicId_key" ON "inspections"("publicId");

-- CreateIndex
CREATE INDEX "inspections_tenantId_performedAt_idx" ON "inspections"("tenantId", "performedAt");

-- CreateIndex
CREATE INDEX "inspections_structureId_performedAt_idx" ON "inspections"("structureId", "performedAt");

-- CreateIndex
CREATE INDEX "inspections_alertId_idx" ON "inspections"("alertId");

-- CreateIndex
CREATE INDEX "inspection_photos_inspectionId_idx" ON "inspection_photos"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_publicId_key" ON "reports"("publicId");

-- CreateIndex
CREATE INDEX "reports_tenantId_createdAt_idx" ON "reports"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_structureId_periodFrom_idx" ON "reports"("structureId", "periodFrom");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

