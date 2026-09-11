import { z } from "zod";

export const projectAddSchema = z.object({
  projectId: z.string().optional(),
  projectName: z.string().min(1, "Project name is required"),
  projectLocation: z.string().min(1, "Project location is required"),
  startDate: z.string().optional().nullable(),
  actualStartDate: z.string().optional().nullable(),
  projectLogo: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  contractorId: z.string().optional().nullable(),
  authorityId: z.string().optional().nullable(),
  deviceId: z.string().optional().nullable(),
  sensorId: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
  /**
   * Assigning a stakeholder by address rather than by id. An email here does
   * not attach anyone to the project: it issues an invitation, and the project
   * columns stay null until that person accepts.
   */
  contractorEmail: z.string().email("A valid contractor email is required").optional().nullable(),
  authorityEmail: z.string().email("A valid authority email is required").optional().nullable(),
});

export type ProjectAddInput = z.infer<typeof projectAddSchema>;

export const projectUpdateSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  projectLocation: z.string().min(1),
  contractorId: z.string().optional().nullable(),
  authorityId: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  // Same meaning as on the add schema: an invitation, not an assignment.
  contractorEmail: z.string().email("A valid contractor email is required").optional().nullable(),
  authorityEmail: z.string().email("A valid authority email is required").optional().nullable(),
});

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const projectDetailUpdateSchema = z.object({
  /** The project image, as a base64 data URL. */
  dashImage: z.string().optional().nullable(),
  dashImage2: z.string().optional().nullable(),
  /**
   * Live video source for the dashboard's upper panel.
   *
   * Constrained to http(s) so the field cannot be used to inject a javascript:
   * or data: URL into the player, which would execute in the viewer's session.
   * An empty string clears it.
   */
  liveVideoUrl: z
    .union([
      z.literal(""),
      z.string().url().startsWith("http", "Must be an http(s) URL").max(512),
    ])
    .optional()
    .nullable(),
});

export type ProjectDetailUpdateInput = z.infer<typeof projectDetailUpdateSchema>;

export const projectCodeSchema = z.object({
  adminName: z.string().min(1),
  contractorName: z.string().min(1),
  authorityName: z.string().min(1),
});

export type ProjectCodeInput = z.infer<typeof projectCodeSchema>;

export const projectListQuerySchema = z.object({
  searchTerm: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  filterType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export const projectStartQuerySchema = z.object({
  statusType: z.enum(["start", "pause", "end"]).default("start"),
});

export type ProjectStartQuery = z.infer<typeof projectStartQuerySchema>;

export const projectOffsetSchema = z.object({
  offset: z.coerce.number().int(),
});

export type ProjectOffsetInput = z.infer<typeof projectOffsetSchema>;

export const dashboardDataParamsSchema = z.object({
  uniqueId: z.string().min(1),
});

export const emailSettingSchema = z.object({
  uniqueId: z.string().min(1),
  /**
   * The recipient list, sent whole: addresses absent from it are removed.
   *
   * An entry with an `emailId` is an existing row being kept (and possibly
   * toggled); an entry without one is a NEW recipient and must carry a real
   * address. Previously the shape had no address field at all, so the only way
   * to create a row was to store the numeric id in the email column — which
   * wrote an undeliverable address every time.
   */
  emails: z.array(
    z.object({
      emailId: z.number().optional(),
      email: z.string().email("Enter a valid email address").max(255).optional(),
      name: z.string().max(120).optional().nullable(),
      isEnable: z.boolean(),
    }),
  ),
});

export type EmailSettingInput = z.infer<typeof emailSettingSchema>;

export const channelUpdateSchema = z.object({
  channelUpdate: z.array(
    z.object({
      channelId: z.string(),
      sensorId: z.string(),
      sensorName: z.string().optional(),
      triggeredValue: z.string().optional().nullable(),
      thresholdValue: z.string().optional().nullable(),
    }),
  ),
});

export type ChannelUpdateInput = z.infer<typeof channelUpdateSchema>;

export const projectSetupSchema = z.object({
  deviceId: z.string().optional(),
});

export type ProjectSetupInput = z.infer<typeof projectSetupSchema>;

export const projectAnalysisSchema = z.object({});

export type ProjectAnalysisInput = z.infer<typeof projectAnalysisSchema>;

/**
 * Attaching, swapping or detaching a project's device.
 *
 * `null` is a meaningful value, not an omission: it detaches the device and
 * leaves the project with none, which is why the field is nullable rather than
 * merely optional.
 */
export const setProjectDeviceSchema = z.object({
  deviceId: z.union([z.string(), z.number()]).nullable().optional(),
});

export type SetProjectDeviceInput = z.infer<typeof setProjectDeviceSchema>;
