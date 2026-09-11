import bcrypt from "bcryptjs";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import prisma from "../../config/prisma";
import { config } from "../../config";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/AppError";
import { isEmailConfigured, sendEmail } from "../../utils/email";
import { saveImageUpload } from "../../utils/image-upload";
import { RoleKey } from "@prisma/client";
import { addMemberToTenant } from "../rbac/tenant.provisioning";
import type { CompleteInvitationInput } from "./invitations.types";

/**
 * Project invitations.
 *
 * An administrator names an email address and a role. A six-digit code is
 * mailed to that address; the person reads it back to the administrator, who
 * enters it and then records the rest of the account — their name, company,
 * phone and first password. The code is the proof that the address is real and
 * reaches the person the administrator is actually dealing with.
 *
 * There is no link and no invitee-facing page: every step is taken by the
 * administrator, from the project they are setting up.
 *
 * Four properties hold throughout:
 *
 * 1. THE PROJECT COLUMN MEANS "ACCEPTED". Project.contractorId and authorityId
 *    are written only on completion, so every existing access check keeps its
 *    current meaning and an invited-but-silent contractor has no access.
 *
 * 2. THE CODE IS STORED HASHED, never in the clear, so a leaked backup yields
 *    no live invitation.
 *
 * 3. ONE LIVE INVITATION PER SLOT. Issuing a new one for the same project and
 *    role voids whatever was outstanding, so a superseded email cannot still be
 *    redeemed.
 *
 * 4. A SPENT INVITATION IS SIMPLY GONE. Expired, revoked and already-accepted
 *    all refuse the same way, so a stale row cannot be revived by retrying.
 */

/** Seven days. Long enough to survive a weekend and an unread inbox. */
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Wrong guesses allowed before the invitation stops accepting codes entirely.
 *
 * Six digits is only a million possibilities, which a script exhausts quickly.
 * The cap, not the length, is what makes guessing impractical — so it is
 * enforced on the row itself and not merely by the request rate limiter, which
 * an attacker with many source addresses can sidestep.
 */
const MAX_OTP_ATTEMPTS = 5;

const OTP_DIGITS = 6;

/** The two project roles an invitation may offer. */
export const INVITABLE_ROLES = ["contractor", "authority"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(value: string): value is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(value);
}

function generateOtp(): string {
  // crypto, not Math.random: a predictable code is not a factor at all.
  return String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, "0");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * The digests are equal-length, so the only thing a timing difference could
 * leak is how many leading characters of a guessed code were right — which is
 * exactly the signal that turns a million guesses into a few thousand.
 */
function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface CreateInvitationParams {
  projectId: number;
  role: InvitableRole;
  emailId: string;
  invitedBy: number;
}

export interface CreateInvitationResult {
  invitationId: number;
  emailId: string;
  role: InvitableRole;
  expiresAt: Date;
  /** False when this deployment has no mail configured. */
  emailSent: boolean;
  /**
   * Populated ONLY outside production and only when mail is unconfigured, so
   * the flow can be followed on a developer machine without an SMTP account.
   * Mirrors password-reset's devResetUrl, and is never returned in production
   * whatever the mail configuration is.
   */
  devOtp?: string;
}

/**
 * Issue an invitation and mail it.
 *
 * The project is read rather than trusted from the caller so the invitation
 * carries the project's real tenant: the invitee joins the organization that
 * owns the project, not one named in a request body.
 */
export async function createInvitation(
  params: CreateInvitationParams,
): Promise<CreateInvitationResult> {
  const emailId = normaliseEmail(params.emailId);

  const project = await prisma.project.findFirst({
    where: { id: params.projectId, isDelete: false },
    select: { id: true, tenantId: true, projectName: true },
  });
  if (!project) throw new NotFoundError("Project not found");

  // Inviting the person who already holds the slot is a no-op dressed as an
  // action; refusing it keeps a stray double-submit from voiding their access.
  const assigned = await prisma.project.findUnique({
    where: { id: project.id },
    select: { contractorId: true, authorityId: true },
  });
  const holderId =
    params.role === "contractor" ? assigned?.contractorId : assigned?.authorityId;
  if (holderId) {
    const holder = await prisma.user.findUnique({
      where: { id: holderId },
      select: { emailId: true },
    });
    if (holder && normaliseEmail(holder.emailId) === emailId) {
      throw new BadRequestError(
        `${holder.emailId} is already the ${params.role} on this project`,
      );
    }
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  // Property 3: whatever was outstanding for this slot stops working now.
  // Done in the same transaction as the insert so a failure cannot leave the
  // slot with no live invitation at all.
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.projectInvitation.updateMany({
      where: { projectId: project.id, role: params.role, status: "pending" },
      data: { status: "revoked" },
    });

    return tx.projectInvitation.create({
      data: {
        projectId: project.id,
        tenantId: project.tenantId,
        role: params.role,
        emailId,
        otpHash: sha256(otp),
        expiresAt,
        invitedBy: params.invitedBy,
      },
    });
  });

  const emailSent = await sendInvitationEmail({
    to: emailId,
    projectName: project.projectName,
    role: params.role,
    otp,
  });

  const result: CreateInvitationResult = {
    invitationId: invitation.id,
    emailId,
    role: params.role,
    expiresAt,
    emailSent,
  };

  if (!isEmailConfigured() && config.nodeEnv !== "production") {
    result.devOtp = otp;
  }

  return result;
}

async function sendInvitationEmail(input: {
  to: string;
  projectName: string;
  role: InvitableRole;
  otp: string;
}): Promise<boolean> {
  const roleLabel = input.role === "contractor" ? "Contractor" : "Authority";

  // A code and nothing else. There is no link to follow: the administrator
  // setting the project up asks for this code and enters it themselves, so the
  // recipient's only job is to read it back to someone they are already
  // speaking to — which is also what makes the code meaningful, since somebody
  // who never received the email cannot supply it.
  return sendEmail({
    to: input.to,
    subject: `Your verification code for ${input.projectName}`,
    html: [
      `<p>Hello,</p>`,
      `<p>You are being added to the project <strong>${input.projectName}</strong> as its ${roleLabel}.</p>`,
      `<p>Your verification code is:</p>`,
      `<p style="font-size:24px;letter-spacing:4px;font-weight:bold">${input.otp}</p>`,
      `<p>Give this code to the administrator setting up your account. They will finish creating it and tell you how to sign in.</p>`,
      `<p>This code expires in 7 days. If you were not expecting it, you can ignore this email — and do not share the code with anyone else.</p>`,
    ].join(""),
    text: [
      `You are being added to the project "${input.projectName}" as its ${roleLabel}.`,
      ``,
      `Verification code: ${input.otp}`,
      ``,
      `Give this code to the administrator setting up your account.`,
      `It expires in 7 days. Do not share it with anyone else.`,
    ].join("\n"),
  });
}

export async function listInvitations(projectId: number) {
  const rows = await prisma.projectInvitation.findMany({
    where: { projectId },
    orderBy: { id: "desc" },
    select: {
      id: true,
      role: true,
      emailId: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      // Which account the acceptance resolved to. The reader needs it to tell
      // an accepted invitation that is still in force from one whose person has
      // since been taken off the project — the row alone cannot say, because a
      // removal deliberately does not rewrite it.
      acceptedBy: true,
      otpAttempts: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    // An expired row keeps status "pending" in the database — nothing sweeps
    // it — so the distinction is drawn here, where it is being read.
    isExpired: row.status === "pending" && row.expiresAt.getTime() < Date.now(),
    // Surfaced so the administrator can tell "no one has opened it" apart from
    // "someone is guessing at it".
    isLocked: row.otpAttempts >= MAX_OTP_ATTEMPTS,
  }));
}

/** Re-issue the code and link for an outstanding invitation. */
export async function resendInvitation(
  invitationId: number,
  projectId: number,
): Promise<CreateInvitationResult> {
  const invitation = await prisma.projectInvitation.findFirst({
    where: { id: invitationId, projectId },
    include: { project: { select: { projectName: true } } },
  });
  if (!invitation) throw new NotFoundError("Invitation not found");
  if (invitation.status === "accepted") {
    throw new BadRequestError("This invitation has already been accepted");
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  // Attempts and any earlier verification reset with the code. Resending is
  // how an administrator unlocks an invitation somebody guessed at, and a
  // carried-over otpVerifiedAt would let a spent verification stand against a
  // brand new code.
  await prisma.projectInvitation.update({
    where: { id: invitation.id },
    data: {
      otpHash: sha256(otp),
      otpAttempts: 0,
      otpVerifiedAt: null,
      status: "pending",
      expiresAt,
    },
  });

  const emailSent = await sendInvitationEmail({
    to: invitation.emailId,
    projectName: invitation.project.projectName,
    role: invitation.role as InvitableRole,
    otp,
  });

  const result: CreateInvitationResult = {
    invitationId: invitation.id,
    emailId: invitation.emailId,
    role: invitation.role as InvitableRole,
    expiresAt,
    emailSent,
  };

  if (!isEmailConfigured() && config.nodeEnv !== "production") {
    result.devOtp = otp;
  }

  return result;
}

export async function revokeInvitation(
  invitationId: number,
  projectId: number,
): Promise<void> {
  const invitation = await prisma.projectInvitation.findFirst({
    where: { id: invitationId, projectId },
    select: { id: true, status: true },
  });
  if (!invitation) throw new NotFoundError("Invitation not found");
  if (invitation.status === "accepted") {
    // Revoking here would suggest the person lost access, which it does not do:
    // their assignment lives on the project row. Removing them is a separate
    // action on the project, not an edit to a historical invitation.
    throw new BadRequestError(
      "This invitation has already been accepted; change the project's assignment instead",
    );
  }

  await prisma.projectInvitation.update({
    where: { id: invitation.id },
    data: { status: "revoked" },
  });
}

/**
 * Load an invitation that can still be acted on, by id, within its project.
 *
 * Scoped by projectId as well as id so that an administrator with access to one
 * project cannot reach an invitation belonging to another by guessing a small
 * integer. Expired, revoked and already-accepted rows all refuse the same way:
 * an invitation that has been spent is simply gone, and retrying cannot revive
 * it.
 */
async function loadOpenInvitation(invitationId: number, projectId: number) {
  const invitation = await prisma.projectInvitation.findFirst({
    where: { id: invitationId, projectId },
    include: {
      project: { select: { id: true, projectName: true, isDelete: true } },
    },
  });

  const usable =
    invitation &&
    invitation.status === "pending" &&
    invitation.expiresAt.getTime() > Date.now() &&
    !invitation.project.isDelete;

  if (!usable) {
    throw new NotFoundError("This invitation is no longer open");
  }

  return invitation;
}

export interface VerifyResult {
  /** True when the administrator must still record the person's details. */
  needsProfile: boolean;
  emailId: string;
  role: InvitableRole;
}

/**
 * Check the code the invitee read back to the administrator.
 *
 * This is the whole of the verification: the person on the other end received
 * a code at an address the administrator typed, and could repeat it. Somebody
 * who never got the email cannot.
 */
export async function verifyInvitationOtp(
  invitationId: number,
  projectId: number,
  otp: string,
): Promise<VerifyResult> {
  const invitation = await loadOpenInvitation(invitationId, projectId);

  if (invitation.otpAttempts >= MAX_OTP_ATTEMPTS) {
    throw new ForbiddenError(
      "Too many incorrect codes were entered. Send a new code to try again.",
    );
  }

  if (!hashesMatch(sha256(otp.trim()), invitation.otpHash)) {
    // Counted before the refusal is returned, so a client that ignores the
    // response still burns the attempt.
    await prisma.projectInvitation.update({
      where: { id: invitation.id },
      data: { otpAttempts: { increment: 1 } },
    });
    throw new BadRequestError("That code is not correct");
  }

  await prisma.projectInvitation.update({
    where: { id: invitation.id },
    data: { otpVerifiedAt: new Date(), otpAttempts: 0 },
  });

  const existing = await prisma.user.findFirst({
    where: { emailId: invitation.emailId, isDelete: "false_" as never },
    select: { id: true },
  });

  return {
    needsProfile: !existing,
    emailId: invitation.emailId,
    role: invitation.role as InvitableRole,
  };
}

export interface CompleteResult {
  emailId: string;
  projectName: string;
  role: InvitableRole;
  /** True when this call created the account, false when it assigned one. */
  accountCreated: boolean;
}

/**
 * Record the account and put it on the project.
 *
 * Everything after the code check happens in one transaction. A half-applied
 * completion — a user with no membership, or a membership with no assignment —
 * is worse than a failed one, because the invitation would already be spent.
 */
export async function completeInvitation(
  invitationId: number,
  projectId: number,
  input: CompleteInvitationInput,
): Promise<CompleteResult> {
  const invitation = await loadOpenInvitation(invitationId, projectId);

  // The code check is not repeated here, but its RESULT is required. Without
  // this, an administrator could create the account having never established
  // that the address they typed reaches anybody at all.
  if (!invitation.otpVerifiedAt) {
    throw new ForbiddenError("Verify the emailed code first");
  }

  const existing = await prisma.user.findFirst({
    where: { emailId: invitation.emailId, isDelete: "false_" as never },
    select: { id: true, status: true, userType: true, isPlatformAdmin: true },
  });

  if (!existing) {
    // Required for a new account, and the schema's columns are NOT NULL. The
    // controller validates the shape; this is the last line of defence for a
    // service-level caller such as a script.
    if (!input.firstName || !input.lastName || !input.phoneNo || !input.password) {
      throw new BadRequestError(
        "First name, last name, phone number and password are required",
      );
    }
  }

  const hashedPassword = input.password
    ? await bcrypt.hash(input.password, 10)
    : null;

  // Written to disk only after the checks above have passed, so a rejected
  // completion does not leave an orphaned file behind.
  const companyLogo = input.companyLogo
    ? await saveImageUpload(input.companyLogo, { dir: "uploads/users" })
    : null;

  const result = await prisma.$transaction(async (tx) => {
    let userId: number;
    let accountCreated = false;

    if (existing) {
      // An existing account keeps its password and its details. Being added to
      // another project is not a reason to overwrite who somebody is.
      userId = existing.id;

      // The role, though, follows the assignment.
      //
      // assertProjectAccess matches userType AND the project slot together, so
      // an account left as "admin" while sitting in contractorId satisfies
      // neither branch and cannot open the project it was just put on. Taking
      // a project role IS becoming that role here.
      //
      // Two exemptions, both for the same reason: re-roling somebody who
      // ADMINISTERS this work would take away their authority over it rather
      // than granting them any.
      //
      //   A PLATFORM OPERATOR — assertProjectAccess short-circuits on
      //   userType === "superadmin", so rewriting that value would lock the
      //   operator out of every project on the deployment.
      //
      //   THIS ORGANIZATION'S OWN ADMIN — an admin who puts themself on their
      //   own project as its authority would otherwise be demoted out of
      //   administering it: the project list scopes a non-superadmin by role,
      //   so they would stop seeing the projects they created.
      //
      // Being an admin of some OTHER organization is not an exemption. That is
      // the case this rule exists for: an outside admin brought in as a
      // contractor is a contractor here, and must be one to see the project.
      const administersThisTenant =
        existing.isPlatformAdmin ||
        (await tx.membership.findFirst({
          where: {
            userId: existing.id,
            tenantId: invitation.tenantId,
            role: { key: RoleKey.ORGANIZATION_ADMIN },
          },
          select: { id: true },
        })) !== null;

      if (!administersThisTenant && existing.userType !== invitation.role) {
        await tx.user.update({
          where: { id: existing.id },
          data: { userType: invitation.role, updatedAt: new Date() },
        });
      }
    } else {
      const created = await tx.user.create({
        data: {
          firstName: input.firstName!,
          lastName: input.lastName!,
          emailId: invitation.emailId,
          phoneNo: input.phoneNo!,
          password: hashedPassword!,
          companyName: input.companyName ?? null,
          companyLogo,
          userType: invitation.role,
          // The code IS the proof of address, so the account starts verified
          // rather than asking for a second confirmation of a mailbox whose
          // contents somebody has already quoted back.
          isMailVerified: "true_" as never,
          isUserVerified: "true_" as never,
          status: "true_" as never,
          isDelete: "false_" as never,
          // DEPRECATED column, kept in step with Membership for the frontend
          // and the not-yet-migrated queries that still read it.
          parentId: 0,
        },
        select: { id: true },
      });
      userId = created.id;
      accountCreated = true;
    }

    await tx.projectInvitation.update({
      where: { id: invitation.id },
      data: { status: "accepted", acceptedAt: new Date(), acceptedBy: userId },
    });

    await tx.project.update({
      where: { id: invitation.projectId },
      data:
        invitation.role === "contractor"
          ? { contractorId: userId }
          : { authorityId: userId },
    });

    // In the transaction, so a completion that cannot place them in the tenant
    // fails whole rather than spending the invitation and leaving them with a
    // project assignment they have no organization to exercise.
    await addMemberToTenant(userId, invitation.tenantId, RoleKey.VIEWER, tx);

    return { userId, accountCreated };
  });

  return {
    emailId: invitation.emailId,
    projectName: invitation.project.projectName,
    role: invitation.role as InvitableRole,
    accountCreated: result.accountCreated,
  };
}

export interface RemoveStakeholderResult {
  projectName: string;
  role: InvitableRole;
  removedUserId: number;
  /** True when they were also taken out of the project's organization. */
  membershipRemoved: boolean;
}

/**
 * Take a contractor or an authority off a project.
 *
 * Clearing the column is the easy half. The other half is deciding what the
 * removal says about the person's place in the organization, and the answer is
 * not always "nothing": somebody whose only connection to an organization was
 * the project they have just been taken off has no remaining reason to be a
 * member of it, and leaving them there quietly grows the member list with
 * people who cannot see anything.
 *
 * So the membership goes too — but only when all three of these hold:
 *
 *   1. They hold no OTHER project in the tenant, in either role. Both columns
 *      are checked, because being the contractor here and the authority there
 *      is perfectly ordinary.
 *   2. They created no project in the tenant. A creator administers what they
 *      made; removing their membership would strand it.
 *   3. They are not the organization's ORGANIZATION_ADMIN. This is the one
 *      that really matters: without it, an admin who assigned themself to one
 *      of their own projects would be evicted from their own organization by
 *      being taken off it.
 *
 * The accepted invitation is deliberately left as it stands. It is a record of
 * something that genuinely happened, and rewriting it to "revoked" to tidy the
 * display would make the history lie.
 */
export async function removeStakeholder(
  projectId: number,
  role: InvitableRole,
): Promise<RemoveStakeholderResult> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, isDelete: false },
    select: {
      id: true,
      tenantId: true,
      projectName: true,
      contractorId: true,
      authorityId: true,
    },
  });
  if (!project) throw new NotFoundError("Project not found");

  const userId =
    role === "contractor" ? project.contractorId : project.authorityId;
  if (!userId) {
    throw new BadRequestError(`This project has no ${role} assigned`);
  }

  const membershipRemoved = await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: role === "contractor" ? { contractorId: null } : { authorityId: null },
    });

    // Counted AFTER the column is cleared, inside the same transaction, so the
    // project just vacated is not itself counted as a reason to stay.
    const otherProjects = await tx.project.count({
      where: {
        tenantId: project.tenantId,
        isDelete: false,
        OR: [{ contractorId: userId }, { authorityId: userId }, { createdBy: userId }],
      },
    });
    if (otherProjects > 0) return false;

    const membership = await tx.membership.findFirst({
      where: { userId, tenantId: project.tenantId },
      select: { id: true, role: { select: { key: true } } },
    });
    if (!membership) return false;
    if (membership.role.key === RoleKey.ORGANIZATION_ADMIN) return false;

    await tx.membership.delete({ where: { id: membership.id } });
    return true;
  });

  return {
    projectName: project.projectName,
    role,
    removedUserId: userId,
    membershipRemoved,
  };
}
