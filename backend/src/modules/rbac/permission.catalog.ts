import { RoleKey } from "@prisma/client";

/**
 * The permission catalog and the role → permission grant matrix.
 *
 * These keys are the single source of truth. They are seeded into the
 * `permissions` and `role_permissions` tables so the grant matrix is queryable,
 * auditable and changeable without a code deploy (§18) — but the catalog itself
 * lives in code so that a typo in a `requirePermission("...")` call is a
 * compile error rather than a silent always-deny at runtime.
 *
 * SUPER_ADMIN is intentionally not in the matrix. A platform operator is not a
 * member of any organization (§19); the authorization layer short-circuits for
 * `isPlatformAdmin` rather than granting it every tenant permission, so that
 * "operates the platform" and "has every permission inside one customer's
 * organization" stay distinct concepts.
 */

export const PERMISSIONS = {
  /**
   * See the project directory: names, IDs, locations and stakeholders.
   *
   * Deliberately separate from PROJECT_VIEW, which opens a project and its
   * measurements. A self-service viewer browses the directory and nothing else,
   * so one permission cannot be allowed to imply the other.
   */
  PROJECT_BROWSE: "Browse the project directory",
  PROJECT_VIEW: "View projects",
  PROJECT_CREATE: "Create projects",
  PROJECT_EDIT: "Edit projects",
  PROJECT_DELETE: "Delete projects",

  STRUCTURE_VIEW: "View structures",
  STRUCTURE_CREATE: "Create structures",
  STRUCTURE_EDIT: "Edit structures",
  STRUCTURE_DELETE: "Delete structures",

  SENSOR_VIEW: "View sensors",
  SENSOR_CONFIGURE: "Configure sensors",
  SENSOR_CALIBRATE: "Record sensor calibration",

  DEVICE_VIEW: "View devices",
  DEVICE_PROVISION: "Provision devices",
  DEVICE_CONFIGURE: "Configure devices",
  DEVICE_RESTART: "Restart devices",
  DEVICE_OTA: "Push firmware updates",

  GATEWAY_VIEW: "View gateways",
  GATEWAY_PROVISION: "Provision gateways",

  SHM_VIEW: "View structural analysis",
  SHM_ANALYZE: "Run structural analysis",

  ALERT_VIEW: "View alerts",
  ALERT_ACKNOWLEDGE: "Acknowledge alerts",
  ALERT_ASSIGN: "Assign alerts",
  ALERT_RESOLVE: "Resolve alerts",

  INSPECTION_VIEW: "View inspections",
  INSPECTION_CREATE: "Record inspections",

  REPORT_VIEW: "View reports",
  REPORT_CREATE: "Generate reports",
  REPORT_EXPORT: "Export report data",

  USER_VIEW: "View organization members",
  USER_INVITE: "Invite organization members",
  USER_MANAGE: "Manage organization members and roles",

  BILLING_VIEW: "View subscription and invoices",
  BILLING_MANAGE: "Change plan and billing details",

  AUDIT_VIEW: "View the audit log",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

const VIEW_ONLY: PermissionKey[] = [
  // Anyone who may view a project may of course also see it listed.
  "PROJECT_BROWSE",
  "PROJECT_VIEW",
  "STRUCTURE_VIEW",
  "SENSOR_VIEW",
  "DEVICE_VIEW",
  "GATEWAY_VIEW",
  "SHM_VIEW",
  "ALERT_VIEW",
  "INSPECTION_VIEW",
  "REPORT_VIEW",
];

/**
 * Grants per role.
 *
 * ORGANIZATION_ADMIN receives every tenant permission — but note that is every
 * permission *within their own tenant*. It is not platform administration.
 */
export const ROLE_GRANTS: Record<RoleKey, PermissionKey[]> = {
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,

  // Analyses structures and adjudicates alerts. Deliberately cannot provision
  // hardware or manage billing: an engineer's authority is over the
  // engineering judgement, not the fleet or the contract.
  SHM_ENGINEER: [
    ...VIEW_ONLY,
    "SENSOR_CALIBRATE",
    "SHM_ANALYZE",
    "ALERT_ACKNOWLEDGE",
    "ALERT_ASSIGN",
    "ALERT_RESOLVE",
    "INSPECTION_CREATE",
    "REPORT_CREATE",
    "REPORT_EXPORT",
  ],

  // Field operations. Owns hardware lifecycle and calibration, and can
  // acknowledge an alert to claim it for investigation — but cannot resolve
  // one, because closing a structural finding is an engineering decision.
  TECHNICIAN: [
    ...VIEW_ONLY,
    "SENSOR_CONFIGURE",
    "SENSOR_CALIBRATE",
    "DEVICE_PROVISION",
    "DEVICE_CONFIGURE",
    "DEVICE_RESTART",
    "DEVICE_OTA",
    "GATEWAY_PROVISION",
    "ALERT_ACKNOWLEDGE",
    "INSPECTION_CREATE",
  ],

  VIEWER: VIEW_ONLY,
};

export const ROLE_DESCRIPTIONS: Record<RoleKey, { name: string; description: string }> = {
  ORGANIZATION_ADMIN: {
    name: "Organization Admin",
    description:
      "Full control of one organization: members, projects, structures, hardware, alerts, reports and subscription.",
  },
  SHM_ENGINEER: {
    name: "SHM Engineer",
    description:
      "Analyses measurements, compares against baseline, adjudicates alerts and produces engineering reports.",
  },
  TECHNICIAN: {
    name: "Technician",
    description:
      "Field operations: installs, configures and calibrates hardware, and records inspections.",
  },
  VIEWER: {
    name: "Viewer",
    description: "Read-only access to authorized monitoring information.",
  },
};
