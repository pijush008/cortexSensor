import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { sendEmail } from "../../utils/email";
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
} from "../../utils/AppError";
import { assertWithinLimits } from "../subscription/subscription.service";
import {
  addMemberToAdminTenant,
  provisionTenantForAdmin,
} from "../rbac/tenant.provisioning";
import { evaluateMfaGate, verifyToken } from "./mfa.service";
import {
  LoginInput,
  RegisterInput,
  UpdateUserInput,
} from "./auth.types";

export async function login(input: LoginInput) {
  const user = await prisma.user.findFirst({
    where: {
      emailId: input.username,
      isDelete: "false_" as never,
    },
  });

  if (!user) {
    throw new BadRequestError("User not found");
  }

  const passwordMatch = await bcrypt.compare(input.password, user.password);
  if (!passwordMatch) {
    throw new BadRequestError("Invalid password");
  }

  if (user.isMailVerified !== ("true_" as never)) {
    throw new BadRequestError("Email Not Verified");
  }

  if (
    user.isUserVerified !== ("true_" as never) &&
    user.userType === "admin"
  ) {
    throw new BadRequestError("User Not Verified");
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
  input: RegisterInput,
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
    const organizationName =
      [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
      input.emailId;
    await provisionTenantForAdmin(userId, organizationName);
  } else if (input.admin_id) {
    await addMemberToAdminTenant(userId, Number(input.admin_id));
  }

  const verificationToken = generateVerificationToken(userId);
  const baseUrl = getBaseUrl();
  const verificationLink = `${baseUrl}/api/verifyUser/${verificationToken}`;

  await sendEmail({
    to: input.emailId,
    subject: "Verify Email",
    html: `Click <a href="${verificationLink}">here</a> to confirm your email.`,
  });

  return { status_code: 200, message: "User added successfully" };
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
