-- AlterTable
ALTER TABLE "gateways" ADD COLUMN     "ingestTokenHash" VARCHAR(128),
ADD COLUMN     "ingestTokenIssuedAt" TIMESTAMP(3),
ADD COLUMN     "ingestTokenLastUsedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "node_data" ADD COLUMN     "batteryMillivolts" INTEGER;

-- CreateTable
CREATE TABLE "gateway_readings" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMPTZ NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "gatewayId" INTEGER NOT NULL,
    "deviceId" INTEGER,
    "sensorId" INTEGER,
    "gatewayKey" VARCHAR(128) NOT NULL,
    "nodeKey" VARCHAR(64) NOT NULL,
    "nodeName" VARCHAR(255),
    "nodeType" VARCHAR(64),
    "projectName" VARCHAR(255),
    "sensorIndex" INTEGER NOT NULL,
    "code" VARCHAR(255),
    "group" VARCHAR(255),
    "sensorType" VARCHAR(120),
    "address" VARCHAR(64),
    "channelId" INTEGER NOT NULL,
    "channelType" VARCHAR(64),
    "rawChannelType" VARCHAR(64),
    "reading" DOUBLE PRECISION,
    "rawReading" DOUBLE PRECISION,
    "unit" VARCHAR(64),
    "rawUnit" VARCHAR(64),
    "description" VARCHAR(255),
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "eventId" VARCHAR(96) NOT NULL,
    "ingestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_readings_pkey" PRIMARY KEY ("ts","id")
);

-- CreateTable
CREATE TABLE "node_network_data" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMPTZ NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "gatewayId" INTEGER NOT NULL,
    "deviceId" INTEGER,
    "gatewayKey" VARCHAR(128) NOT NULL,
    "nodeKey" VARCHAR(64) NOT NULL,
    "parentKey" VARCHAR(64),
    "etx" INTEGER,
    "rssi" INTEGER,
    "ingestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_network_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_heartbeats" (
    "id" SERIAL NOT NULL,
    "ts" TIMESTAMPTZ NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "gatewayId" INTEGER NOT NULL,
    "gatewayKey" VARCHAR(128) NOT NULL,
    "disk" VARCHAR(255),
    "diskUsed" DOUBLE PRECISION,
    "diskSpace" DOUBLE PRECISION,
    "powerInVolts" DOUBLE PRECISION,
    "powerInCurrent" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "pressure" DOUBLE PRECISION,
    "dataUsage" DOUBLE PRECISION,
    "internetMode" VARCHAR(32),
    "ingestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The index create_hypertable() would build; created here so a plain
-- PostgreSQL instance ends up with the same shape as a Timescale one.
CREATE INDEX IF NOT EXISTS "gateway_readings_ts_idx" ON "gateway_readings"("ts" DESC);

-- CreateIndex
CREATE INDEX "gateway_readings_gatewayId_ts_idx" ON "gateway_readings"("gatewayId", "ts" DESC);

-- CreateIndex
CREATE INDEX "gateway_readings_deviceId_ts_idx" ON "gateway_readings"("deviceId", "ts" DESC);

-- CreateIndex
CREATE INDEX "gateway_readings_sensorId_ts_idx" ON "gateway_readings"("sensorId", "ts" DESC);

-- CreateIndex
CREATE INDEX "gateway_readings_tenantId_ts_idx" ON "gateway_readings"("tenantId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_readings_eventId_ts_key" ON "gateway_readings"("eventId", "ts");

-- CreateIndex
CREATE INDEX "node_network_data_gatewayId_ts_idx" ON "node_network_data"("gatewayId", "ts" DESC);

-- CreateIndex
CREATE INDEX "node_network_data_deviceId_ts_idx" ON "node_network_data"("deviceId", "ts" DESC);

-- CreateIndex
CREATE INDEX "gateway_heartbeats_gatewayId_ts_idx" ON "gateway_heartbeats"("gatewayId", "ts" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gateways_ingestTokenHash_key" ON "gateways"("ingestTokenHash");


-- ---------------------------------------------------------------------------
-- gateway_readings is keyed like measurements — (ts, id), with the
-- idempotency index (eventId, ts) — so it partitions the same way. On a
-- TimescaleDB instance it becomes a hypertable; elsewhere it stays a plain
-- table, which is correct but unpartitioned, exactly as measurements did
-- before the 20260916 migration ranged it.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable(
      'gateway_readings',
      'ts',
      chunk_time_interval => INTERVAL '7 days',
      if_not_exists       => TRUE,
      migrate_data        => TRUE
    );
    RAISE NOTICE 'gateway_readings converted to a TimescaleDB hypertable';
  ELSE
    RAISE NOTICE 'timescaledb extension not present; gateway_readings left as a plain table';
  END IF;
END
$$;

-- Born closed to the Data API, like every other table (20260917150100).
ALTER TABLE "gateway_readings"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "node_network_data"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gateway_heartbeats" ENABLE ROW LEVEL SECURITY;
