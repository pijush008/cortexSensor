-- One definition of measurements_ts_idx on every database: (ts DESC).
--
-- create_hypertable() builds this index itself, descending, so on a fresh
-- TimescaleDB the 20260909 migration's CREATE INDEX IF NOT EXISTS was a no-op
-- and the index stayed DESC. Supabase, where measurements is partitioned by
-- pg_partman instead, ran the CREATE and got ASC. The schema can declare only
-- one, and CI's drift check compares the schema against a fresh Timescale
-- database — so it failed there and nowhere else.
--
-- DESC is the right one: it is what Timescale wants, a b-tree serves both
-- directions anyway, and the live views read latest-first. Rebuilding is cheap
-- now — the ingest has not started — and on the partitioned parent the CREATE
-- reaches every partition.
DROP INDEX IF EXISTS "measurements_ts_idx";
CREATE INDEX "measurements_ts_idx" ON "measurements" ("ts" DESC);
