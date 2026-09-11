import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
  // Only supplied on the second leg of an MFA login.
  mfaToken: z
    .string()
    .regex(/^\d{6}$/, "Multi-factor code must be 6 digits")
    .optional(),
});

export const forgotPasswordSchema = z.object({
  username: z.string().email("Invalid email format"),
});

/**
 * A new password set from an emailed reset link.
 *
 * The minimum is stated once here and enforced on the server, so it cannot be
 * bypassed by posting straight to the endpoint. It matches the rule applied at
 * registration; a reset must not be a way to install a weaker password than
 * signing up allows.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(32, "Invalid reset link"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
});

export const validateOtpSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  inputOTP: z.string().min(1, "OTP is required"),
});

export const changePasswordSchema = z.object({
  newPassword: z.string().min(1, "New password is required"),
  /**
   * Only meaningful on the RESET path, where there is no session to read the
   * identity from — and even there the reset token names the user and is
   * checked against it. A signed-in caller's id comes from their session and
   * this is ignored, so the field is optional rather than required.
   */
  userId: z.string().min(1).optional(),
  oldPassword: z.string().nullable().optional(),
  resetToken: z.string().optional(),
});

export const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  emailId: z.string().email("Invalid email format"),
  phoneNo: z.string().min(1, "Phone number is required"),
  // Eight, matching the password reset path. It was min(1), which accepted a
  // single character — so an account could be created with a weaker password
  // than the same account is allowed to reset to.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
  profileImage: z.string().nullable().optional(),
  admin_id: z.string().nullable().optional(),
});

/**
 * Registration of an organization ADMIN, who brings a company with them.
 *
 * A separate schema rather than optional fields on the base one, because the
 * same endpoint also registers contractors and authorities — people being added
 * INTO an existing organization, who have no company of their own to name. Zod
 * strips unknown keys, so a contractor payload carrying `companyName` has it
 * discarded before the service sees it: the scoping is enforced by the shape
 * rather than by a runtime check somebody has to remember to write.
 *
 * The discriminator is `:userType` in the path, not a body field, so this
 * cannot be a discriminated union or a superRefine — the controller picks the
 * schema.
 */
export const registerAdminSchema = registerSchema.extend({
  // `required_error` as well as `.min(1)`: when the key is absent entirely Zod
  // raises invalid_type before any string rule runs, and the default message is
  // the bare word "Required", which tells the person nothing about which field.
  companyName: z
    .string({ required_error: "Company name is required" })
    .trim()
    .min(1, "Company name is required")
    .max(255, "Company name is too long"),
  companyLogo: z
    .string({ required_error: "A company logo is required" })
    .min(1, "A company logo is required"),
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
export type RegisterAdminInput = z.infer<typeof registerAdminSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export interface ApiResponse {
  status_code: number;
  message: string | null;
  error?: unknown;
  [key: string]: unknown;
}
