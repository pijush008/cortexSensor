DO $$
BEGIN
  -- Add a snake_case timestamptz column and create hypertable on it (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sensor_data' AND column_name='created_at'
  ) THEN
    ALTER TABLE "sensor_data" ADD COLUMN created_at timestamptz;
    UPDATE "sensor_data" SET created_at = "createdAt";
    PERFORM create_hypertable('sensor_data', 'created_at', if_not_exists => TRUE, create_default_indexes => FALSE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='node_data' AND column_name='created_at'
  ) THEN
    ALTER TABLE "node_data" ADD COLUMN created_at timestamptz DEFAULT now();
    UPDATE "node_data" SET created_at = "createdAt";
    PERFORM create_hypertable('node_data', 'created_at', if_not_exists => TRUE, create_default_indexes => FALSE);
  END IF;
END
$$;
