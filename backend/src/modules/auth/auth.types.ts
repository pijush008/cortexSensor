import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  username: z.string().email("Invalid email format"),
});

export const validateOtpSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  inputOTP: z.string().min(1, "OTP is required"),
});

export const changePasswordSchema = z.object({
  newPassword: z.string().min(1, "New password is required"),
  userId: z.string().min(1, "User ID is required"),
  oldPassword: z.string().nullable().optional(),
  resetToken: z.string().optional(),
});

export const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  emailId: z.string().email("Invalid email format"),
  phoneNo: z.string().min(1, "Phone number is required"),
  password: z.string().min(1, "Password is required"),
  profileImage: z.string().nullable().optional(),
  admin_id: z.string().nullable().optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  emailId: z.string().email().optional(),
  phoneNo: z.string().optional(),
  password: z.string().optional(),
  profileImage: z.string().nullable().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ValidateOtpInput = z.infer<typeof validateOtpSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export interface ApiResponse {
  status_code: number;
  message: string | null;
  error?: unknown;
  [key: string]: unknown;
}
