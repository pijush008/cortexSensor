import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { sendEmail } from "../../utils/email";
import { logger } from "../../utils/logger";
import {
  generateRandomPassword,
  generateVerificationToken,
  verifyVerificationToken,
  getBaseUrl,
  formatImageUrl,
  saveBase64Image,
} from "../../utils/helper";
import {
  signAccessToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
} from "../../utils/jwt";
import {
  BadRequestError,
  MfaRequiredError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
} from "../../utils/AppError";
import { assertWithinLimits } from "../subscription/subscription.service";
import { saveImageUpload } from "../../utils/image-upload";
import {
  addMemberToAdminTenant,
  provisionTenantForAdmin,
} from "../rbac/tenant.provisioning";
import { evaluateMfaGate, verifyToken } from "./mfa.service";
import {
  LoginInput,
  RegisterAdminInput,
  RegisterInput,
  UpdateUserInput,
} from "./auth.types";

/**
 * A bcrypt hash of a value no account uses, compared against when the email is
 * unknown so that path does the same work as a real password check. The cost
 * factor must match the one used at registration (10) or the timing difference
 * it exists to erase simply reappears.
 */
const ABSENT_USER_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function login(input: LoginInput) {
  const user = await prisma.user.findFirst({
    where: {
      emailId: input.username,
      isDelete: "false_" as never,
    },
  });

  // A failed sign-in answers with ONE message and ONE status, whichever half
  // was wrong.
  //
  // Distinguishing "User not found" from "Invalid password" is a user
  // enumeration oracle: anyone can discover which email addresses hold accounts
  // on this platform by watching which of the two comes back, which is exactly
  // the list an attacker wants before starting a credential-stuffing run. On a
  // monitoring platform that list also reveals who operates which infrastructure.
  //
  // 401 rather than 400: the request was well formed, the credentials were not
  // accepted. 400 told the client its payload was malformed, which sent the
  // sign-in form down a generic "the request was rejected" path instead of
  // saying the password was wrong.
  const passwordMatch = user
    ? await bcrypt.compare(input.password, user.password)
    : // Compared against a throwaway hash so a missing account costs the same
      // bcrypt work as a wrong password. Without this the message is uniform
      // but the RESPONSE TIME still discloses which addresses exist.
      await bcrypt.compare(input.password, ABSENT_USER_HASH);

  if (!user || !passwordMatch) {
    throw new UnauthorizedError("Incorrect email or password");
  }

  if (user.isMailVerified !== ("true_" as never)) {
    throw new BadRequestError("Email Not Verified");
  }

  // An organization admin is not usable until their payment has been confirmed
  // by a verified webhook. The old message here was "User Not Verified", which
  // told someone who had just paid nothing about what to do next and read as a
  // fault rather than a pending step.
  if (
    user.isUserVerified !== ("true_" as never) &&
    user.userType === "admin"
  ) {
    throw new ForbiddenError(
      "This account is not active yet. It is activated once payment is confirmed — if you have just paid, this can take a moment.",
    );
  }

  // Second factor, checked only after the password has been verified so a
  // wrong password and a missing code are indistinguishable to an attacker
  // probing which accounts have MFA enabled.
  const gate = evaluateMfaGate({
    isPlatformAdmin: user.isPlatformAdmin,
    mfaEnabledAt: user.mfaEnabledAt,
  });

  if (gate.required) {
    if (!input.mfaToken) {
      throw new MfaRequiredError("A multi-factor authentication code is required");
    }
    if (!user.mfaSecret || !verifyToken(user.mfaSecret, input.mfaToken)) {
      throw new BadRequestError("Invalid multi-factor code");
    }
  }

  return {
    status_code: 200,
    message: null,
    error: null,
    userID: user.id,
    type: user.userType,
    // Signals the client to walk the operator through enrolment (§94).
    mfaEnrolmentRequired: gate.enrolmentRequired,
  };
}

export async function generateAccessToken(userId: number): Promise<string> {
  return signAccessToken(userId);
}

export async function forgotPassword(username: string) {
  const user = await prisma.user.findFirst({
    where: {
      emailId: username,
      isDelete: "false_" as never,
    },
  });

  if (!user) {
    throw new BadRequestError("User not found");
  }

  const otp = generateRandomPassword();

  const emailSent = await sendEmail({
    to: user.emailId,
    subject: "Password Reset OTP",
    html: `Your OTP for password reset is: ${otp}`,
  });

  await prisma.tempOtp.deleteMany({ where: { userId: user.id } });

  if (emailSent) {
    await prisma.tempOtp.create({
      data: {
        userId: user.id,
        otp,
        createdAt: new Date(),
      },
    });
    return { status_code: 200, message: "Success", userID: user.id };
  } else {
    throw new BadRequestError("Failed to send OTP via email");
  }
}

export async function validateOTP(userId: string, inputOTP: string) {
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) {
    throw new BadRequestError("User not found");
  }

  const otpRecord = await prisma.tempOtp.findFirst({
    where: { userId: Number(userId) },
  });

  if (!otpRecord) {
    throw new BadRequestError("Wrong OTP");
  }

  if (inputOTP !== otpRecord.otp) {
    throw new BadRequestError("Incorrect OTP");
  }

  const otpAgeMs = Date.now() - otpRecord.createdAt.getTime();
  if (otpAgeMs > 10 * 60 * 1000) {
    throw new BadRequestError("OTP has expired. Please request a new one.");
  }

  await prisma.tempOtp.deleteMany({ where: { userId: Number(userId) } });

  const resetToken = await signPasswordResetToken(Number(userId));

  return {
    status_code: 200,
    message: "OTP validated successfully",
    resetToken,
  };
}

export async function changePassword(
  userId: string,
  newPassword: string,
  oldPassword: string | null,
  resetToken?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) {
    throw new BadRequestError("User not found");
  }

  if (oldPassword === null) {
    if (!resetToken) {
      throw new ForbiddenError("Password reset token is required");
    }

    let payload;
    try {
      payload = verifyPasswordResetToken(resetToken);
    } catch {
      throw new ForbiddenError("Invalid or expired reset token");
    }

    if (payload.purpose !== "password_reset" || payload.userId !== user.id) {
      throw new ForbiddenError("Invalid reset token");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: Number(userId) },
      data: { password: hashedPassword },
    });
    return { status_code: 200, message: "Password updated successfully" };
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new BadRequestError("Old password is incorrect");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: Number(userId) },
    data: { password: hashedPassword },
  });
  return { status_code: 200, message: "Password updated successfully" };
}

export async function register(
  userType: string,
  input: RegisterInput | RegisterAdminInput,
) {
  let userId: number | null = null;

  // Billing: adding a member (contractor/authority) under an admin must stay
  // within the admin's plan limit.
  if (
    (userType === "contractor" || userType === "authority") &&
    input.admin_id
  ) {
    await assertWithinLimits(Number(input.admin_id), { users: 1 });
  }

  const existingUser = await prisma.user.findFirst({
    where: { emailId: input.emailId },
  });

  if (existingUser) {
    if (existingUser.isDelete === ("true_" as never)) {
      userId = existingUser.id;
    } else {
      throw new BadRequestError("Email already exists");
    }
  }

  const hashedPassword = await bcrypt.hash(input.password, 10);

  let imagePath: string | null = null;
  if (input.profileImage) {
    imagePath = await saveBase64Image(
      input.profileImage,
      input.firstName,
      "uploads/users",
    );
  }

  const isUserVerified =
    userType === "contractor" || userType === "authority"
      ? ("true_" as never)
      : ("false_" as never);

  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isDelete: "false_" as never,
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNo: input.phoneNo,
        password: hashedPassword,
        userType: userType as "superadmin" | "admin" | "contractor" | "authority",
        profileImage: imagePath,
        isUserVerified,
        parentId: input.admin_id ? Number(input.admin_id) : 0,
      },
    });
  } else {
    const newUser = await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        emailId: input.emailId,
        phoneNo: input.phoneNo,
        password: hashedPassword,
        userType: userType as "superadmin" | "admin" | "contractor" | "authority",
        profileImage: imagePath,
        isMailVerified: "false_" as never,
        isUserVerified,
        status: "true_" as never,
        parentId: input.admin_id ? Number(input.admin_id) : 0,
        isDelete: "false_" as never,
      },
    });
    userId = newUser.id;
  }

  // Registering an organization admin and creating their organization are the
  // same business event (§93). Doing it here means every row they create
  // afterwards lands in a tenant, instead of relying on a backfill to repair
  // rows that were created without one.
  if (userType === "admin") {
    const admin = input as RegisterAdminInput;

    // The company the person typed, not their own name. This used to be
    // `firstName + lastName`, which named every organization after a person and
    // left nowhere to put a logo.
    //
    // The email fallback is unreachable through the API — the schema requires a
    // non-empty name — but Tenant.name is NOT NULL and `register()` is callable
    // from a script, so it stays as the last line of defence.
    const organizationName = admin.companyName?.trim() || input.emailId;

    // Written to disk only now, AFTER the duplicate-email check and the user
    // row have both succeeded. Saving it earlier would leave an orphaned file
    // behind every rejected registration — and with a required logo, a rejected
    // registration is the common case, not the rare one.
    const logoPath = await saveImageUpload(admin.companyLogo, {
      dir: "uploads/tenants",
    });

    await provisionTenantForAdmin(userId, organizationName, logoPath);
  } else if (input.admin_id) {
    await addMemberToAdminTenant(userId, Number(input.admin_id));
  }

  const verificationToken = generateVerificationToken(userId);
  const baseUrl = getBaseUrl();
  const verificationLink = `${baseUrl}/api/verifyUser/${verificationToken}`;

  const sent = await sendEmail({
    to: input.emailId,
    subject: "Verify your email",
    html: [
      `<p>Hello ${input.firstName || "there"},</p>`,
      `<p>Confirm this address to finish setting up your account.</p>`,
      `<p><a href="${verificationLink}">Verify my email</a></p>`,
    ].join(""),
    text: `Confirm your email address: ${verificationLink}`,
  });

  // Say what actually happened.
  //
  // This used to return "User added successfully" whether or not the message
  // went anywhere, so a deployment with no SMTP credentials looked like it was
  // working while every account sat unverifiable and unable to sign in. The
  // account IS created either way — the registration succeeded — but the person
  // waiting for an email deserves to know none is coming.
  if (!sent) {
    logger.warn(
      `Verification email for ${input.emailId} was NOT sent: outbound mail is not configured.`,
    );
  }

  return {
    status_code: 200,
    message: sent
      ? "User added successfully"
      : "Account created, but the verification email could not be sent. Contact your administrator.",
    emailSent: sent,
    // Development only, and only when mail is unconfigured: without this the
    // signup flow cannot be completed at all on a machine with no SMTP account,
    // because the link exists solely inside a message nobody can receive.
    ...(!sent && config.nodeEnv !== "production"
      ? { devVerificationUrl: verificationLink }
      : {}),
  };
}

export async function verifyPrimaryUser(token: string) {
  if (!token) {
    throw new BadRequestError("Invalid Token");
  }

  const payload = verifyVerificationToken(token);

  await prisma.user.update({
    where: { id: payload.ID },
    data: { isMailVerified: "true_" as never },
  });

  return { status_code: 200, message: "Account Verified" };
}

export async function sendVerificationLink(emailId: string) {
  const user = await prisma.user.findFirst({
    where: {
      emailId,
      isDelete: "false_" as never,
    },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.isMailVerified === ("true_" as never)) {
    throw new BadRequestError("Email is already verified");
  }

  const verificationToken = generateVerificationToken(user.id);
  const baseUrl = getBaseUrl();
  const verificationLink = `${baseUrl}/api/verifyUser/${verificationToken}`;

  await sendEmail({
    to: emailId,
    subject: "Verify Email",
    html: `Click <a href="${verificationLink}">here</a> to confirm your email.`,
  });

  return { status_code: 200, message: "Verification link sent successfully" };
}

export async function updateUser(userId: string, input: UpdateUserInput) {
  const existingUser = await prisma.user.findUnique({
    where: { id: Number(userId) },
  });

  if (!existingUser) {
    throw new NotFoundError("User not found");
  }

  const updateData: Record<string, unknown> = {};

  if (input.firstName) updateData.firstName = input.firstName;
  if (input.lastName) updateData.lastName = input.lastName;
  if (input.emailId) updateData.emailId = input.emailId;
  if (input.phoneNo) updateData.phoneNo = input.phoneNo;

  if (input.password) {
    updateData.password = await bcrypt.hash(input.password, 10);
  }

  if (input.profileImage) {
    const imagePath = await saveBase64Image(
      input.profileImage,
      input.firstName || existingUser.firstName,
      "uploads/users",
    );
    updateData.profileImage = imagePath;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({
      where: { id: Number(userId) },
      data: updateData,
    });
  }

  return { status_code: 200, message: "User updated successfully" };
}

async function validateUserDeletion(user: {
  id: number;
  userType: string;
}) {
  if (user.userType === "superadmin") {
    throw new ForbiddenError(
      "Unauthorized, You cannot delete a Super Admin",
    );
  }

  let projects: { id: number; projectName: string }[] = [];

  switch (user.userType) {
    case "admin":
      projects = await prisma.project.findMany({
        where: {
          createdBy: user.id,
          isDelete: false,
          status: { in: ["start", "pause"] },
        },
        select: { id: true, projectName: true },
      });
      break;
    case "contractor":
      projects = await prisma.project.findMany({
        where: {
          contractorId: user.id,
          isDelete: false,
          status: { in: ["start", "pause"] },
        },
        select: { id: true, projectName: true },
      });
      break;
    case "authority":
      projects = await prisma.project.findMany({
        where: {
          authorityId: user.id,
          isDelete: false,
          status: { in: ["start", "pause"] },
        },
        select: { id: true, projectName: true },
      });
      break;
    default:
      throw new BadRequestError("Invalid user type");
  }

  if (projects.length > 0) {
    const names = projects.map((p) => p.projectName).join(", ");
    const capitalizedType =
      user.userType.charAt(0).toUpperCase() + user.userType.slice(1);
    throw new BadRequestError(
      `${capitalizedType} cannot delete the project(s). ${names} ${projects.length > 1 ? "are" : "is"} currently running.`,
    );
  }
}

export async function deleteUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: Number(userId),
      isDelete: "false_" as never,
    },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  await validateUserDeletion(user);

  let deleteIds = [user.id];

  if (user.userType === "admin") {
    const relatedUsers = await prisma.user.findMany({
      where: {
        parentId: user.id,
        isDelete: "false_" as never,
      },
      select: { id: true },
    });

    deleteIds = deleteIds.concat(relatedUsers.map((u) => u.id));

    await prisma.sensor.updateMany({
      where: { assignedAdmin: user.id },
      data: { assignedAdmin: null },
    });

    await prisma.device.updateMany({
      where: { assignedAdmin: user.id },
      data: { assignedAdmin: null },
    });

    await prisma.project.updateMany({
      where: {
        createdBy: user.id,
        status: { not: "end" },
      },
      data: {
        isDelete: true,
        endDate: new Date(),
        status: "end",
      },
    });
  }

  await prisma.user.updateMany({
    where: { id: { in: deleteIds } },
    data: {
      isDelete: "true_" as never,
      isUserVerified: "false_" as never,
      isMailVerified: "false_" as never,
    },
  });

  return { status_code: 200, message: "User deleted successfully!" };
}

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      userType: true,
      firstName: true,
      lastName: true,
      emailId: true,
      phoneNo: true,
      isMailVerified: true,
      isUserVerified: true,
      profileImage: true,
      csv: true,
    },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return {
    status_code: 200,
    message: "success",
    userDetail: [
      {
        ...user,
        profileImage: formatImageUrl(user.profileImage ?? ""),
      },
    ],
  };
}

export async function superAdminVerifyUser(
  userId: string,
  verifyType: string,
) {
  const user = await prisma.user.findFirst({
    where: {
      id: Number(userId),
      isDelete: "false_" as never,
    },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  await validateUserDeletion(user);

  await prisma.user.update({
    where: { id: Number(userId) },
    data: { isUserVerified: verifyType as "true_" | "false_" },
  });

  if (verifyType === "false" && user.userType === "admin") {
    await prisma.user.updateMany({
      where: { parentId: user.id },
      data: { isUserVerified: "false_" as never },
    });

    await prisma.sensor.updateMany({
      where: { assignedAdmin: user.id },
      data: { assignedAdmin: null },
    });

    await prisma.device.updateMany({
      where: { assignedAdmin: user.id },
      data: { assignedAdmin: null },
    });

    await prisma.project.updateMany({
      where: {
        createdBy: user.id,
        status: { notIn: ["end", "not_start"] },
      },
      data: {
        endDate: new Date(),
        status: "end",
      },
    });

    await prisma.project.updateMany({
      where: {
        createdBy: user.id,
        status: "not_start",
      },
      data: {
        isDelete: true,
        status: "end",
      },
    });
  }

  return {
    status_code: 200,
    message: "success",
    error: "Status Changed Successfully!",
  };
}

export async function adminDeleteSoft(adminId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: Number(adminId),
      isDelete: "false_" as never,
    },
  });

  if (!user) {
    throw new BadRequestError("User not found or already deleted");
  }

  await prisma.user.update({
    where: { id: Number(adminId) },
    data: { isDelete: "true_" as never },
  });

  await prisma.project.updateMany({
    where: { createdBy: Number(adminId) },
    data: {
      status: "end",
      contractorId: null,
      authorityId: null,
      deviceId: null,
      sensorId: null,
    },
  });

  return {
    status_code: 200,
    message: "Success",
    error: "Admin deleted successfully",
  };
}

export async function adminDeactivate(adminId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: Number(adminId),
      isDelete: "false_" as never,
    },
  });

  if (!user) {
    throw new BadRequestError("User not found");
  }

  await prisma.user.update({
    where: { id: Number(adminId) },
    data: { status: "false_" as never },
  });

  await prisma.project.updateMany({
    where: { createdBy: Number(adminId) },
    data: { status: "end" },
  });

  return {
    status_code: 200,
    message: "Success",
    error: "Admin Deactivate successfully",
  };
}
