-- A contractor's or authority's company identity, recorded on their account.
-- Free text plus a relative logo path, not a Tenant: they are members of the
-- PROJECT's organization, and an organization of their own would put them
-- across an isolation boundary from the project they work on.
ALTER TABLE "users" ADD COLUMN "companyName" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "companyLogo" VARCHAR(255);

-- The emailed link is gone: an administrator now enters the code the invitee
-- read back to them, so an invitation is addressed by id under its project and
-- never by a token from a URL. Outstanding invitations are unaffected — they
-- are matched by their code, which is untouched.
DROP INDEX IF EXISTS "project_invitations_tokenHash_key";
ALTER TABLE "project_invitations" DROP COLUMN "tokenHash";
