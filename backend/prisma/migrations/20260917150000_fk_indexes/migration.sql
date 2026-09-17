-- Covering indexes for the foreign keys that had none.
--
-- Postgres does not index the referencing side of a foreign key. Without one,
-- every DELETE or key UPDATE on the referenced row scans the whole referencing
-- table to check for dependants, and joins on the key cannot use an index.
-- Supabase's advisor listed these ten.

CREATE INDEX IF NOT EXISTS "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");
CREATE INDEX IF NOT EXISTS "memberships_roleId_idx" ON "memberships"("roleId");
CREATE INDEX IF NOT EXISTS "devices_deviceType_idx" ON "devices"("deviceType");
CREATE INDEX IF NOT EXISTS "devices_updatedBy_idx" ON "devices"("updatedBy");
CREATE INDEX IF NOT EXISTS "alerts_ruleId_idx" ON "alerts"("ruleId");
CREATE INDEX IF NOT EXISTS "analysis_runs_baselineId_idx" ON "analysis_runs"("baselineId");
CREATE INDEX IF NOT EXISTS "firebase_tokens_userId_idx" ON "firebase_tokens"("userId");
CREATE INDEX IF NOT EXISTS "subscriptions_planId_idx" ON "subscriptions"("planId");
CREATE INDEX IF NOT EXISTS "project_invitations_invitedBy_idx" ON "project_invitations"("invitedBy");
CREATE INDEX IF NOT EXISTS "project_invitations_tenantId_idx" ON "project_invitations"("tenantId");
