-- Sensor.unit was CHAR(255): a fixed-width type that pads with spaces. Every
-- unit was stored and returned as e.g. "uS" followed by 253 blanks, which then
-- appeared on axis labels, reading tables and exports.
--
-- Existing values are trimmed before the type change so no padding survives
-- the migration.
UPDATE "sensors" SET "unit" = btrim("unit") WHERE "unit" IS NOT NULL;

ALTER TABLE "sensors" ALTER COLUMN "unit" TYPE VARCHAR(32) USING btrim("unit")::VARCHAR(32);
