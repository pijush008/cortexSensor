-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AnalysisKind" AS ENUM ('spectrum', 'baseline_compare');

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "kind" "AnalysisKind" NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'queued',
    "sensorId" INTEGER NOT NULL,
    "structureId" INTEGER,
    "windowFrom" TIMESTAMPTZ NOT NULL,
    "windowTo" TIMESTAMPTZ NOT NULL,
    "sampleRateHz" DOUBLE PRECISION,
    "method" VARCHAR(64),
    "parameters" JSONB,
    "engineVersion" VARCHAR(32),
    "baselineId" INTEGER,
    "result" JSONB,
    "error" TEXT,
    "requestedBy" INTEGER,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baselines" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "sensorId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" VARCHAR(160) NOT NULL,
    "notes" TEXT,
    "windowFrom" TIMESTAMPTZ NOT NULL,
    "windowTo" TIMESTAMPTZ NOT NULL,
    "sampleRateHz" DOUBLE PRECISION,
    "method" VARCHAR(64),
    "parameters" JSONB,
    "engineVersion" VARCHAR(32),
    "peaks" JSONB NOT NULL,
    "environmentalContext" JSONB,
    "isRetired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_runs_publicId_key" ON "analysis_runs"("publicId");

-- CreateIndex
CREATE INDEX "analysis_runs_tenantId_queuedAt_idx" ON "analysis_runs"("tenantId", "queuedAt");

-- CreateIndex
CREATE INDEX "analysis_runs_sensorId_queuedAt_idx" ON "analysis_runs"("sensorId", "queuedAt");

-- CreateIndex
CREATE INDEX "analysis_runs_status_idx" ON "analysis_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "baselines_publicId_key" ON "baselines"("publicId");

-- CreateIndex
CREATE INDEX "baselines_tenantId_idx" ON "baselines"("tenantId");

-- CreateIndex
CREATE INDEX "baselines_sensorId_isRetired_idx" ON "baselines"("sensorId", "isRetired");

-- CreateIndex
CREATE UNIQUE INDEX "baselines_sensorId_version_key" ON "baselines"("sensorId", "version");

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "baselines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

