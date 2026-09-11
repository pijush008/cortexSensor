-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'revoked');

-- CreateTable
CREATE TABLE "project_invitations" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "role" "UserRole" NOT NULL,
    "emailId" VARCHAR(255) NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "otpHash" VARCHAR(128) NOT NULL,
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpVerifiedAt" TIMESTAMP(3),
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" INTEGER,
    "invitedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_invitations_tokenHash_key" ON "project_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "project_invitations_projectId_role_status_idx" ON "project_invitations"("projectId", "role", "status");

-- CreateIndex
CREATE INDEX "project_invitations_emailId_idx" ON "project_invitations"("emailId");

-- CreateIndex
CREATE INDEX "project_invitations_expiresAt_idx" ON "project_invitations"("expiresAt");

-- AddForeignKey
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
