import { z } from "zod";

/**
 * Request schemas for structures and locations.
 *
 * Note what is absent: `tenantId`. It is never accepted from a client (§17) —
 * it is taken from the authenticated session. Leaving it out of the schema
 * means a client that sends one has it silently discarded by Zod rather than
 * it being read by accident somewhere downstream.
 */

const STRUCTURE_TYPES = [
  "bridge",
  "flyover",
  "building",
  "tower",
  "dam",
  "tunnel",
  "railway",
  "pier",
  "industrial",
  "other",
] as const;

const STRUCTURE_STATUSES = [
  "planned",
  "commissioning",
  "monitoring",
  "paused",
  "decommissioned",
] as const;

/** Accepts a number or a numeric string; empty string becomes undefined. */
const optionalDecimal = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

const optionalInt = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isInteger(n) ? n : undefined;
  });

export const createStructureSchema = z.object({
  projectId: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  name: z.string().trim().min(1, "Structure name is required").max(160),
  code: z
    .string()
    .trim()
    .min(1, "Asset code is required")
    .max(64)
    .regex(
      /^[A-Za-z0-9._\-/]+$/,
      "Asset code may contain letters, numbers and . _ - / only",
    ),
  type: z.enum(STRUCTURE_TYPES).default("other"),
  description: z.string().trim().max(4000).optional(),
  latitude: optionalDecimal.refine(
    (v) => v === undefined || (v >= -90 && v <= 90),
    "Latitude must be between -90 and 90",
  ),
  longitude: optionalDecimal.refine(
    (v) => v === undefined || (v >= -180 && v <= 180),
    "Longitude must be between -180 and 180",
  ),
  siteAddress: z.string().trim().max(255).optional(),
  constructionYear: optionalInt.refine(
    (v) => v === undefined || (v >= 1800 && v <= 2200),
    "Construction year looks implausible",
  ),
  spanCount: optionalInt.refine(
    (v) => v === undefined || (v >= 0 && v <= 10000),
    "Span count looks implausible",
  ),
  lengthMetres: optionalDecimal.refine(
    (v) => v === undefined || (v >= 0 && v <= 100000),
    "Length must be a positive distance in metres",
  ),
  material: z.string().trim().max(120).optional(),
  designStandard: z.string().trim().max(120).optional(),
  commissionedAt: z.string().datetime().optional().or(z.string().date().optional()),
  status: z.enum(STRUCTURE_STATUSES).default("planned"),
});

export const updateStructureSchema = createStructureSchema
  .partial()
  .omit({ projectId: true });

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, "Location name is required").max(160),
  code: z
    .string()
    .trim()
    .min(1, "Point reference is required")
    .max(64)
    .regex(
      /^[A-Za-z0-9._\-/]+$/,
      "Point reference may contain letters, numbers and . _ - / only",
    ),
  description: z.string().trim().max(4000).optional(),
  stationMetres: optionalDecimal,
  elevationMetres: optionalDecimal,
  offsetXMetres: optionalDecimal,
  offsetYMetres: optionalDecimal,
  offsetZMetres: optionalDecimal,
  latitude: optionalDecimal.refine(
    (v) => v === undefined || (v >= -90 && v <= 90),
    "Latitude must be between -90 and 90",
  ),
  longitude: optionalDecimal.refine(
    (v) => v === undefined || (v >= -180 && v <= 180),
    "Longitude must be between -180 and 180",
  ),
  isActive: z.boolean().optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

export const listStructuresQuerySchema = z.object({
  projectId: z.string().optional(),
  status: z.enum(STRUCTURE_STATUSES).optional(),
  type: z.enum(STRUCTURE_TYPES).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateStructureInput = z.infer<typeof createStructureSchema>;
export type UpdateStructureInput = z.infer<typeof updateStructureSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type ListStructuresQuery = z.infer<typeof listStructuresQuerySchema>;
