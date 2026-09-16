-- AlterTable
ALTER TABLE "measurements" ALTER COLUMN "value" DROP NOT NULL;

-- CreateIndex
--
-- IF NOT EXISTS, because the migration immediately before this one converts
-- `measurements` to a TimescaleDB hypertable and create_hypertable() builds an
-- index on the time column itself. On a database where the extension is present
-- BEFORE migrations run — a fresh deployment against the timescaledb image, or
-- CI — this statement then fails with 42P07 and every later migration is
-- blocked behind it.
--
-- It went unnoticed because an existing developer database was migrated
-- incrementally: this migration applied before the hypertable one was written,
-- so the collision never happened there. Only a from-scratch migration hits it.
CREATE INDEX IF NOT EXISTS "measurements_ts_idx" ON "measurements"("ts");

