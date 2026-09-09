import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as subscriptionService from "./subscription.service";
import { switchPlanSchema } from "./subscription.types";
import { auditLogger } from "../../utils/audit";

function handleControllerError(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  const message = (err.message || "Something Went Wrong").replace(/"/g, "");
  return res.status(statusCode).json({
    status_code: statusCode,
    message,
    error: statusCode === 500 ? null : undefined,
  });
}

export async function getPlanHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ status_code: 401, message: "Unauthorized" });
    }
    const data = await subscriptionService.getPlanView(req.user);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function switchPlanHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ status_code: 401, message: "Unauthorized" });
    }
    const result = switchPlanSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const adminId = await subscriptionService.resolveSubscriptionAdminId(req.user);
    const response = await subscriptionService.switchPlan(adminId, result.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user.id,
      action: "subscription-update",
      entity: "subscription",
      entityId: adminId ?? undefined,
      newValue: { planCode: result.data.planCode },
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function listInvoicesHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ status_code: 401, message: "Unauthorized" });
    }
    const adminId = await subscriptionService.resolveSubscriptionAdminId(req.user);
    const response = await subscriptionService.listInvoices(adminId);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function downloadInvoiceHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ status_code: 401, message: "Unauthorized" });
    }
    const { invoiceNo } = req.params;
    const adminId = await subscriptionService.resolveSubscriptionAdminId(req.user);
    const invoice = await subscriptionService.getInvoiceForAdmin(adminId, invoiceNo);
    if (!invoice) {
      return res.status(404).json({ status_code: 404, message: "Invoice not found" });
    }
    const csv = subscriptionService.invoiceToCsv(
      invoice as unknown as subscriptionService.InvoiceCsvSource,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoiceNo}.csv"`,
    );
    return res.status(200).send(csv);
  } catch (error) {
    return handleControllerError(res, error);
  }
}