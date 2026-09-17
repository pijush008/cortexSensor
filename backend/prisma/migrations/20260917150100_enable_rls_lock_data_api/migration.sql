-- Close the public schema to Supabase's Data API roles.
--
-- Supabase exposes every table in `public` over PostgREST, and grants the
-- `anon` and `authenticated` roles full privileges on each new table by
-- default. Row Level Security was off on all 52 tables, so anyone holding the
-- project's anon key — which is designed to be public — could SELECT, UPDATE
-- or TRUNCATE `users`, `refresh_tokens`, `device_credentials`, `invoices` and
-- the rest. Confirmed before this migration: `SET ROLE anon; SELECT count(*)
-- FROM users` returned every row.
--
-- The application never uses the Data API. It connects as `postgres`, which
-- owns the tables and has BYPASSRLS, so nothing here changes what the app can
-- do. It does two things to what everyone else can do:
--
--   1. Enables RLS on every table. With no policies, RLS denies every row to
--      every role that does not bypass it. Deny-by-default, table by table.
--   2. Revokes the Data API roles' privileges outright, and revokes them from
--      the default privileges so tables created later — pg_partman's weekly
--      measurement partitions above all — are born closed too.
--
-- Either alone would do; together, a future policy or grant has to be written
-- deliberately, for one table, before the Data API can read it. That is the
-- right starting point for the day live data is read from Supabase directly.
--
-- Everything is guarded, because the same migration runs on the local and CI
-- Postgres where the Supabase roles and pg_cron do not exist.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tbl);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    -- The default ACL that hands new tables to these roles belongs to the
    -- `postgres` role, which is what Prisma and pg_partman create tables as.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END
$$;

-- New partitions are created without RLS (the flag is not inherited from the
-- parent). The revoked default privileges already keep them closed to the
-- Data API; this switches RLS on for them as well, so the advisor stays quiet
-- and the two layers keep agreeing. Run nightly, ten minutes after partman
-- has made the week's partitions.
CREATE OR REPLACE FUNCTION public.shm_enable_rls_on_new_tables() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tbl);
  END LOOP;
END
$$;

-- cron.job is referenced through dynamic SQL: plpgsql resolves table names
-- when it parses the block, before the IF is evaluated, and the local and CI
-- Postgres have no cron schema to resolve it against.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $cron$
      SELECT cron.schedule(
        'shm-rls-new-partitions',
        '27 3 * * *',
        'SELECT public.shm_enable_rls_on_new_tables()'
      )
      WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shm-rls-new-partitions')
    $cron$;
  END IF;
END
$$;
