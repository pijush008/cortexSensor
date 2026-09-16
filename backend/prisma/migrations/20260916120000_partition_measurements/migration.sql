-- ---------------------------------------------------------------------------
-- Partition `measurements` by time, for deployments WITHOUT TimescaleDB.
--
-- The existing 20260909090000 migration converts this table to a Timescale
-- hypertable when the extension is present. Supabase does not offer
-- timescaledb — verified against the live instance, which lists pg_cron,
-- pg_partman, postgis and vector but not timescaledb — so on Supabase that
-- migration correctly left `measurements` as one ordinary, unpartitioned table.
--
-- At the stated ingest rate of ~1M rows/day that is 365M rows in the first
-- year, in a single heap, with every history query scanning it. Native range
-- partitioning restores what the hypertable was there to provide: the planner
-- prunes to the weeks a query actually asks for, and old data can eventually be
-- detached rather than deleted row by row.
--
-- One week per partition, matching the `chunk_time_interval => INTERVAL '7
-- days'` the hypertable migration chose, so the two backends behave alike.
--
-- Guarded three ways, because this same file runs against a developer's
-- Timescale container, against Supabase, and against an already-migrated
-- database:
--   * TimescaleDB present  -> leave the hypertable alone.
--   * Already partitioned  -> nothing to do.
--   * pg_partman absent    -> partition anyway; a DEFAULT partition still
--                             accepts every row, it simply is not pruned.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  has_timescale boolean;
  current_kind  "char";
  idx           record;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')
    INTO has_timescale;

  SELECT c.relkind INTO current_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'measurements';

  IF current_kind IS NULL THEN
    RAISE NOTICE 'measurements does not exist; nothing to partition';
    RETURN;
  END IF;

  IF has_timescale THEN
    RAISE NOTICE 'timescaledb present; measurements is already a hypertable';
    RETURN;
  END IF;

  IF current_kind = 'p' THEN
    RAISE NOTICE 'measurements is already partitioned';
    RETURN;
  END IF;

  -- A plain table cannot be altered into a partitioned one, so the table is
  -- rebuilt and its rows moved across.

  -- The sequence behind `id` is owned by the column we are about to drop, and
  -- would be dropped with it. Release it first, re-attach it after, so the
  -- generator keeps its current value instead of restarting at 1 and colliding.
  ALTER SEQUENCE measurements_id_seq OWNED BY NONE;

  -- Renaming a table does NOT rename its indexes, and the new table wants those
  -- names for its own. Move the old ones aside rather than hard-coding a list
  -- that would rot the next time an index is added.
  ALTER TABLE public.measurements RENAME TO measurements_unpartitioned;
  FOR idx IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'measurements_unpartitioned'
  LOOP
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I',
                   idx.indexname, idx.indexname || '_old');
  END LOOP;

  -- INCLUDING ALL carries the column types, defaults, constraints and indexes.
  -- The primary key is (ts, id) and the idempotency key is (eventId, ts): both
  -- already contain the partition column, which is what Postgres requires of
  -- every unique index on a partitioned table. That was true by design — the
  -- hypertable migration records that `sensor_data`, keyed on (id) alone, could
  -- never be converted for exactly this reason.
  EXECUTE 'CREATE TABLE public.measurements '
       || '(LIKE public.measurements_unpartitioned INCLUDING ALL) '
       || 'PARTITION BY RANGE ("ts")';

  ALTER SEQUENCE measurements_id_seq OWNED BY public.measurements.id;

  RAISE NOTICE 'measurements rebuilt as a RANGE-partitioned table on ts';
END
$$;

-- ---------------------------------------------------------------------------
-- pg_partman: create the week partitions ahead of time, and keep creating them.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  moved bigint;
BEGIN
  -- Only for the freshly rebuilt table; a Timescale or already-configured
  -- database leaves this alone.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'measurements_unpartitioned'
  ) THEN
    RAISE NOTICE 'no rebuild in progress; skipping partition set-up';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_partman') THEN
    CREATE SCHEMA IF NOT EXISTS partman;
    CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

    -- p_default_table defaults to true, so partman creates the DEFAULT
    -- partition itself: a row with an unexpected timestamp is stored rather
    -- than rejected. p_premake = 4 keeps a month of future weeks ready, so a
    -- late maintenance run cannot strand an insert.
    PERFORM partman.create_parent(
      p_parent_table := 'public.measurements',
      p_control      := 'ts',
      p_interval     := '1 week',
      p_premake      := 4
    );
    RAISE NOTICE 'pg_partman managing public.measurements (1 week, premake 4)';
  ELSE
    -- Without partman there is no automation, but the table must still accept
    -- writes: one catch-all partition does that. Unpruned, so no faster than
    -- before — and no slower.
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.measurements_default '
         || 'PARTITION OF public.measurements DEFAULT';
    RAISE NOTICE 'pg_partman unavailable; created a DEFAULT partition only';
  END IF;

  -- Move the rows across, then drop the old heap and the indexes renamed above.
  EXECUTE 'INSERT INTO public.measurements '
       || 'SELECT * FROM public.measurements_unpartitioned';
  GET DIAGNOSTICS moved = ROW_COUNT;
  RAISE NOTICE 'moved % row(s) into the partitioned table', moved;

  DROP TABLE public.measurements_unpartitioned;
END
$$;

-- ---------------------------------------------------------------------------
-- pg_cron: run partman's maintenance nightly so next week's partition exists
-- before anything needs to write to it.
--
-- NO RETENTION IS CONFIGURED. partman can drop old partitions automatically,
-- and deleting a customer's measurement history because a default looked
-- sensible is not a decision a migration gets to make. Set
-- partman.part_config.retention deliberately when a policy exists.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron unavailable; run partman.run_maintenance_proc() from your own scheduler';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman') THEN
    RAISE NOTICE 'pg_partman not installed here; no maintenance to schedule';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Re-running the migration must not stack duplicate jobs.
  PERFORM cron.unschedule('shm-partman-maintenance')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shm-partman-maintenance');

  PERFORM cron.schedule(
    'shm-partman-maintenance',
    '17 3 * * *',
    $cron$CALL partman.run_maintenance_proc()$cron$
  );
  RAISE NOTICE 'pg_cron will run partman maintenance nightly at 03:17 UTC';
END
$$;
