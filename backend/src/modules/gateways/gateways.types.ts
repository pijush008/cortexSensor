import { z } from "zod";

const GATEWAY_STATUSES = [
  "provisioning",
  "active",
  "degraded",
  "offline",
  "maintenance",
  "decommissioned",
] as const;

const optionalId = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isInteger(n) ? n : undefined;
  });

export const createGatewaySchema = z.object({
  /**
   * The identifier the hardware reports as GatewayDeviceId. Constrained to a
   * conservative charset because it appears in MQTT topics and log lines.
   */
  gatewayKey: z
    .string()
    .trim()
    .min(3, "Gateway identifier is required")
    .max(128)
    .regex(
      /^[A-Za-z0-9._:-]+$/,
      "Gateway identifier may contain letters, numbers and . _ : - only",
    ),
  name: z.string().trim().min(1, "Gateway name is required").max(160),
  description: z.string().trim().max(4000).optional(),
  projectId: optionalId,
  structureId: optionalId,
  locationId: optionalId,
  firmwareVersion: z.string().trim().max(64).optional(),
  hardwareModel: z.string().trim().max(120).optional(),
});

export const updateGatewaySchema = createGatewaySchema
  .partial()
  .omit({ gatewayKey: true })
  .extend({ status: z.enum(GATEWAY_STATUSES).optional() });

export const listGatewaysQuerySchema = z.object({
  status: z.enum(GATEWAY_STATUSES).optional(),
  projectId: z.string().optional(),
  /** "1": only gateways no project holds, and that are not decommissioned. */
  available: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const issueCredentialSchema = z.object({
  label: z.string().trim().max(120).optional(),
  /** Optional expiry; omitted means the credential does not self-expire. */
  expiresAt: z.string().datetime().optional(),
});

export type CreateGatewayInput = z.infer<typeof createGatewaySchema>;
export type UpdateGatewayInput = z.infer<typeof updateGatewaySchema>;
export type ListGatewaysQuery = z.infer<typeof listGatewaysQuerySchema>;
export type IssueCredentialInput = z.infer<typeof issueCredentialSchema>;
