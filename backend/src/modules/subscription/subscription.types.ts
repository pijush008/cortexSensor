import { z } from "zod";

export const switchPlanSchema = z.object({
  planCode: z.enum(["starter", "professional", "enterprise"]),
});

export type SwitchPlanInput = z.infer<typeof switchPlanSchema>;

export const invoiceStatusSchema = z.enum(["PAID", "OPEN"]);