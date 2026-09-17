/**
 * The billing plans, as seeded.
 *
 * Kept apart from seed.ts so a test can check that what the marketing page
 * advertises is what billing_plans charges — the seed is the one place the
 * numbers are written down, and the page copy is derived from these rows at
 * request time (see modules/billing/plan-catalog.ts).
 *
 * Prices are in paise: 499900 is ₹4,999.
 */
export const BILLING_PLANS = [
  {
    code: "complimentary",
    name: "Platform Owner Plan",
    priceMonthly: 0,
    currency: "INR",
    maxStructures: null,
    maxSensors: null,
    maxUsers: null,
    dataRetentionDays: null,
    apiAccess: true,
    smsAlerts: true,
    aiFeatures: true,
    advancedReports: true,
    femIntegration: true,
    sso: true,
  },
  {
    code: "starter",
    name: "Starter",
    priceMonthly: 499900, // ₹4,999
    currency: "INR",
    maxStructures: 3,
    maxSensors: 20,
    maxUsers: 5,
    dataRetentionDays: 30,
    apiAccess: false,
    smsAlerts: false,
    aiFeatures: false,
    advancedReports: false,
    femIntegration: false,
    sso: false,
  },
  {
    code: "professional",
    name: "Professional",
    priceMonthly: 1499900, // ₹14,999
    currency: "INR",
    maxStructures: 20,
    maxSensors: 200,
    maxUsers: 25,
    dataRetentionDays: 365,
    apiAccess: true,
    smsAlerts: true,
    aiFeatures: true,
    advancedReports: true,
    femIntegration: false,
    sso: false,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    priceMonthly: 0, // custom / quoted
    currency: "INR",
    maxStructures: null,
    maxSensors: null,
    maxUsers: null,
    dataRetentionDays: null,
    apiAccess: true,
    smsAlerts: true,
    aiFeatures: true,
    advancedReports: true,
    femIntegration: true,
    sso: true,
  },
] as const;
