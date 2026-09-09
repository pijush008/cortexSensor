-- CreateEnum
CREATE TYPE "StructureType" AS ENUM ('bridge', 'flyover', 'building', 'tower', 'dam', 'tunnel', 'railway', 'pier', 'industrial', 'other');

-- CreateEnum
CREATE TYPE "StructureStatus" AS ENUM ('planned', 'commissioning', 'monitoring', 'paused', 'decommissioned');

-- CreateTable
CREATE TABLE "structures" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "type" "StructureType" NOT NULL DEFAULT 'other',
    "description" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "siteAddress" VARCHAR(255),
    "constructionYear" INTEGER,
    "spanCount" INTEGER,
    "lengthMetres" DECIMAL(10,2),
    "material" VARCHAR(120),
    "designStandard" VARCHAR(120),
    "commissionedAt" TIMESTAMP(3),
    "status" "StructureStatus" NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "structureId" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "stationMetres" DECIMAL(10,3),
    "elevationMetres" DECIMAL(10,3),
    "offsetXMetres" DECIMAL(10,3),
    "offsetYMetres" DECIMAL(10,3),
    "offsetZMetres" DECIMAL(10,3),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "structures_publicId_key" ON "structures"("publicId");

-- CreateIndex
CREATE INDEX "structures_tenantId_idx" ON "structures"("tenantId");

-- CreateIndex
CREATE INDEX "structures_projectId_idx" ON "structures"("projectId");

-- CreateIndex
CREATE INDEX "structures_tenantId_status_idx" ON "structures"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "structures_tenantId_code_key" ON "structures"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_publicId_key" ON "locations"("publicId");

-- CreateIndex
CREATE INDEX "locations_tenantId_idx" ON "locations"("tenantId");

-- CreateIndex
CREATE INDEX "locations_structureId_idx" ON "locations"("structureId");

-- CreateIndex
CREATE UNIQUE INDEX "locations_structureId_code_key" ON "locations"("structureId", "code");

-- AddForeignKey
ALTER TABLE "structures" ADD CONSTRAINT "structures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structures" ADD CONSTRAINT "structures_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

