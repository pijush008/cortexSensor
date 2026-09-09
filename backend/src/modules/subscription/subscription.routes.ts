import { Router } from "express";
import { authenticate, adminOnly } from "../../middleware/auth";
import * as subscriptionController from "./subscription.controller";

const router = Router();

router.get(
  "/subscription/plan",
  authenticate,
  adminOnly,
  subscriptionController.getPlanHandler,
);

router.post(
  "/subscription/plan",
  authenticate,
  adminOnly,
  subscriptionController.switchPlanHandler,
);

router.get(
  "/subscription/invoices",
  authenticate,
  adminOnly,
  subscriptionController.listInvoicesHandler,
);

router.post(
  "/subscription/invoices/:invoiceNo/download",
  authenticate,
  adminOnly,
  subscriptionController.downloadInvoiceHandler,
);

export default router;