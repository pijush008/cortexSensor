-- CreateEnum
CREATE TYPE "IngestionFileStatus" AS ENUM ('received', 'processed', 'failed', 'unknown_gateway', 'duplicate');

-- AlterTable
ALTER TABLE "gateways" ADD COLUMN     "claimedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ingestion_files" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER,
    "gatewayId" INTEGER,
    "projectId" INTEGER,
    "gatewayKey" VARCHAR(128),
    "nodeKey" VARCHAR(64),
    "fileType" VARCHAR(32) NOT NULL,
    "fileName" VARCHAR(512) NOT NULL,
    "filePath" VARCHAR(1024) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "IngestionFileStatus" NOT NULL DEFAULT 'received',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsStored" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,

    CONSTRAINT "ingestion_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_files_sha256_key" ON "ingestion_files"("sha256");

-- CreateIndex
CREATE INDEX "ingestion_files_status_receivedAt_idx" ON "ingestion_files"("status", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "ingestion_files_tenantId_receivedAt_idx" ON "ingestion_files"("tenantId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "ingestion_files_gatewayKey_receivedAt_idx" ON "ingestion_files"("gatewayKey", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gateways_projectId_key" ON "gateways"("projectId");

-- AddForeignKey
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Born closed to the Data API, like every other table (20260917150100).
ALTER TABLE "ingestion_files" ENABLE ROW LEVEL SECURITY;
