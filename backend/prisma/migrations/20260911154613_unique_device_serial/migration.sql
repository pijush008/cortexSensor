-- A device's serial number identifies one physical unit, so no two rows may
-- carry the same one. The column stays nullable and Postgres permits many NULLs
-- under a unique index, so devices recorded before a serial was known are
-- untouched.
CREATE UNIQUE INDEX "devices_deviceId_key" ON "devices"("deviceId");
