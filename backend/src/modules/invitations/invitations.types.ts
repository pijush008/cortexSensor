import { z } from "zod";

/**
 * A password an invitee chooses for themselves.
 *
 * Matched to what registration already demands, so the rule a person meets
 * when accepting an invitation is the rule they would have met signing up.
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const createInvitationSchema = z.object({
  role: z.enum(["contractor", "authority"], {
    errorMap: () => ({ message: "Role must be contractor or authority" }),
  }),
  emailId: z.string().email("A valid email address is required"),
});

export const verifyInvitationSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your invitation email"),
});

/**
 * The detail fields are optional at the schema level because an EXISTING user
 * being added to another project needs none of them. Which of the two shapes
 * applies is decided by the service, the only place that knows whether the
 * invited address already has an account — a caller cannot be trusted to say.
 */
export const completeInvitationSchema = z.object({
  firstName: z.string().trim().min(1).max(255).optional(),
  lastName: z.string().trim().min(1).max(255).optional(),
  phoneNo: z.string().trim().min(6).max(20).optional(),
  password: passwordSchema.optional(),
  /** The firm they work for. Optional — not everyone has one to record. */
  companyName: z.string().trim().max(255).optional().nullable(),
  /** A base64 data URI, saved to disk by the service and stored as a path. */
  companyLogo: z.string().optional().nullable(),
});

export type CompleteInvitationInput = z.infer<typeof completeInvitationSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
