-- The idempotency index on measurements (eventId, ts) under the name Prisma
-- expects for a @@unique: measurements_eventId_ts_key.
--
-- The 20260916 partition rebuild carried the unique index over to the new
-- parent as measurements_eventId_ts_idx. Same definition, same guarantees,
-- different name — and `migrate diff` compares names, so the partitioned
-- database (Supabase) reported drift that the Timescale ones, which never
-- took that path, did not. Guarded: a no-op wherever the name is already
-- right.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'measurements_eventId_ts_idx')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'measurements_eventId_ts_key') THEN
    ALTER INDEX "measurements_eventId_ts_idx" RENAME TO "measurements_eventId_ts_key";
  END IF;
END
$$;
