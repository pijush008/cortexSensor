-- CreateTable
CREATE TABLE "measurements" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMPTZ NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "sensorId" INTEGER NOT NULL,
    "deviceId" INTEGER,
    "gatewayId" INTEGER,
    "locationId" INTEGER,
    "structureId" INTEGER,
    "value" DOUBLE PRECISION NOT NULL,
    "rawValue" DOUBLE PRECISION,
    "calibrationId" INTEGER,
    "sequenceNumber" BIGINT,
    "eventId" VARCHAR(64),
    "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ingestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("ts","id")
);

-- CreateIndex
CREATE INDEX "measurements_sensorId_ts_idx" ON "measurements"("sensorId", "ts");

-- CreateIndex
CREATE INDEX "measurements_tenantId_ts_idx" ON "measurements"("tenantId", "ts");

-- CreateIndex
CREATE INDEX "measurements_structureId_ts_idx" ON "measurements"("structureId", "ts");

-- CreateIndex
CREATE INDEX "measurements_locationId_ts_idx" ON "measurements"("locationId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "measurements_eventId_ts_key" ON "measurements"("eventId", "ts");


-- ---------------------------------------------------------------------------
-- TimescaleDB hypertable conversion.
--
-- This is what docker-init/init_hypertables.sql could never do. Two things
-- make it work here where it failed there:
--
--   1. TIMING. It runs as a Prisma migration, so the table exists. The old
--      script ran from /docker-entrypoint-initdb.d, before any migration had
--      created a table to convert.
--
--   2. KEY SHAPE. Timescale requires the partition column in every unique
--      index. `measurements` is keyed on (ts, id) and its idempotency
--      constraint is (eventId, ts), so both already include `ts`. The old
--      sensor_data table had PRIMARY KEY (id) alone, which no amount of
--      shadow-column trickery could satisfy.
--
-- Guarded so the migration still applies on a plain PostgreSQL instance
-- without the extension: the table then behaves as an ordinary table, which is
-- correct but unpartitioned.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable(
      'measurements',
      'ts',
      chunk_time_interval => INTERVAL '7 days',
      if_not_exists       => TRUE,
      migrate_data        => TRUE
    );
    RAISE NOTICE 'measurements converted to a TimescaleDB hypertable (7 day chunks)';
  ELSE
    RAISE NOTICE 'timescaledb extension not present; measurements left as a plain table';
  END IF;
END
$$;
