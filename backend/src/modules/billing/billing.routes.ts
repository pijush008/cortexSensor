import express, { Response, Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth";
import { requirePermission, requireTenant } from "../../middleware/authorize";
import prisma from "../../config/prisma";
import { logger } from "../../utils/logger";
import { auditLogger } from "../../utils/audit";
import { tenantScope } from "../rbac/rbac.service";
import { paymentProvider } from "./provider";
import { listSignupPlans, startCheckoutForUser } from "./checkout.service";
import { verifyCheckoutToken } from "../../utils/jwt";
import {
  evaluateEntitlement,
  handleWebhook,
  isBillingConfigured,
} from "./billing.service";

const router = Router();

/**
 * Payment provider webhook.
 *
 * Mounted with a RAW body parser, not the JSON one. Signatures are computed
 * over the exact bytes the provider sent; verifying a re-serialized object
 * compares against bytes nobody signed, and key ordering or whitespace would
 * make it fail unpredictably.
 *
 * Deliberately unauthenticated in the session sense — the provider has no
 * cookie. The signature IS the authentication, which is why it is checked
 * before the body is even parsed.
 */
router.post(
  "/billing/webhook",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res: Response) => {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : String(req.body ?? "");

    const signature =
      (req.header("x-signature") ||
        req.header("x-webhook-signature") ||
        req.header("stripe-signature")) ??
      undefined;

    if (!paymentProvider.isConfigured()) {
      // Refusing rather than accepting silently: an unconfigured endpoint that
      // returns 200 would let unsigned traffic look like it was accepted.
      logger.warn("Billing webhook received but no webhook secret is configured");
      return res.status(503).json({
        status_code: 503,
        message: "Billing is not configured on this deployment",
      });
    }

    if (!paymentProvider.verifySignature(rawBody, signature)) {
      logger.warn("Billing webhook rejected: signature verification failed");
      return res
        .status(401)
        .json({ status_code: 401, message: "Invalid signature" });
    }

    let event;
    try {
      event = paymentProvider.parseEvent(rawBody);
    } catch {
      return res
        .status(400)
        .json({ status_code: 400, message: "Malformed webhook payload" });
    }

    try {
      const result = await handleWebhook(event);
      // 200 even for a duplicate: a 4xx would make the provider retry forever
      // an event that has already been applied correctly.
      return res.status(200).json({
        status_code: 200,
        received: true,
        duplicate: result.duplicate,
        message: result.message,
      });
    } catch (err) {
      // 500 so the provider retries — the event is stored with its error, so
      // the retry is idempotent and the failure is diagnosable.
      logger.error(`Billing webhook handling failed: ${(err as Error).message}`);
      return res.status(500).json({
        status_code: 500,
        message: "Event stored but could not be applied; it will be retried",
      });
    }
  },
);

/** Current entitlement, computed from dates rather than read from a flag. */
router.get(
  "/billing/entitlement",
  authenticate,
  requireTenant,
  requirePermission("BILLING_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const ctx = req.auth!;
      const subscription = await prisma.subscription.findFirst({
        where: ctx.isPlatformAdmin ? {} : { ...tenantScope(ctx) },
        include: { plan: true },
      });

      if (!subscription) {
        return res.status(200).json({
          status_code: 200,
          message: null,
          data: {
            // Stated plainly rather than defaulting to "active": a tenant with
            // no subscription record is a state someone should notice.
            configured: isBillingConfigured(),
            subscription: null,
            entitlement: null,
          },
        });
      }

      const entitlement = evaluateEntitlement(subscription);

      return res.status(200).json({
        status_code: 200,
        message: null,
        data: {
          configured: isBillingConfigured(),
          subscription: {
            status: subscription.status,
            planCode: subscription.plan.code,
            planName: subscription.plan.name,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            canceledAt: subscription.canceledAt,
          },
          entitlement,
        },
      });
    } catch (error) {
      const err = error as { statusCode?: number; message: string };
      return res
        .status(err.statusCode || 400)
        .json({ status_code: err.statusCode || 400, message: err.message });
    }
  },
);

/**
 * Begins a checkout. Returns the provider's redirect target.
 *
 * Note what this does NOT do: it never marks the subscription paid. The
 * browser coming back from a checkout page proves nothing — it can be replayed
 * or forged, and the charge may still fail afterwards. Only a verified webhook
 * activates a subscription (§25).
 */
router.post(
  "/billing/checkout",
  authenticate,
  requireTenant,
  requirePermission("BILLING_MANAGE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const ctx = req.auth!;
      if (!isBillingConfigured()) {
        return res.status(503).json({
          status_code: 503,
          message:
            "No payment provider is configured on this deployment, so checkout cannot be started.",
        });
      }

      const { ipAddress, userAgent } = auditLogger.requestContext(req);
      await auditLogger.audit({
        userId: ctx.userId,
        action: "update",
        entity: "subscription",
        newValue: { checkoutRequested: true },
        ipAddress,
        userAgent,
      });

      return res.status(200).json({
        status_code: 200,
        ...(await startCheckoutForUser(ctx.userId)),
      });
    } catch (error) {
      const err = error as { statusCode?: number; message: string };
      return res
        .status(err.statusCode || 400)
        .json({ status_code: err.statusCode || 400, message: err.message });
    }
  },
);

/**
 * Start payment for an account that cannot sign in yet.
 *
 * Unauthenticated by necessity. A new organization admin is inactive until a
 * webhook confirms their payment, so requiring a session here would mean
 * needing a session to pay and a payment to get a session. The checkout token
 * is the narrow substitute: one subscription, thirty minutes, no read access,
 * and a purpose claim so a password-reset link cannot stand in for it.
 */
router.post(
  "/billing/checkout/start",
  // This router is mounted AHEAD of the global express.json() (app.ts:103 vs
  // :106) so the webhook above can verify a signature over raw bytes. That
  // leaves every other route here without a parsed body, so this one brings
  // its own parser rather than moving the router and breaking the webhook.
  express.json({ limit: "16kb" }),
  async (req: AuthRequest, res: Response) => {
    const body = (req.body ?? {}) as {
      checkoutToken?: unknown;
      planCode?: unknown;
    };
    const token = String(body.checkoutToken ?? "");
    const planCode =
      typeof body.planCode === "string" && body.planCode ? body.planCode : undefined;

    let userId: number;
    try {
      userId = Number(verifyCheckoutToken(token).userId);
    } catch {
      // Deliberately one message for every rejection — expired, forged,
      // malformed or wrong-purpose. Distinguishing them tells an attacker
      // which half of a guess was right.
      return res.status(401).json({
        status_code: 401,
        message:
          "This payment link is invalid or has expired. Register again to get a new one.",
      });
    }

    if (!isBillingConfigured()) {
      return res.status(503).json({
        status_code: 503,
        message:
          "No payment provider is configured on this deployment, so checkout cannot be started.",
      });
    }

    try {
      return res
        .status(200)
        .json({
          status_code: 200,
          ...(await startCheckoutForUser(userId, planCode)),
        });
    } catch (error) {
      // A provider that cannot open an order is a 503, not a client error:
      // nothing the caller sent is wrong.
      const err = error as { statusCode?: number; message: string };
      const status = err.statusCode || 503;
      return res.status(status).json({ status_code: status, message: err.message });
    }
  },
);

/**
 * Plans a new organization can choose between.
 *
 * Public: the sign-up page needs it before anyone has an account. It exposes
 * only what a price list shows anyway — name, price, limits — and never the
 * internal plans, which config filters out.
 */
router.get("/billing/plans", async (_req, res: Response) => {
  try {
    return res
      .status(200)
      .json({ status_code: 200, plans: await listSignupPlans() });
  } catch (error) {
    const err = error as { message: string };
    return res.status(500).json({ status_code: 500, message: err.message });
  }
});

export default router;
