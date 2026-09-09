import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { requirePermission, requireTenant } from "../../middleware/authorize";
import * as controller from "./gateways.controller";

const router = Router();

router.get(
  "/gateways",
  authenticate,
  requireTenant,
  requirePermission("GATEWAY_VIEW"),
  controller.list,
);
router.post(
  "/gateways",
  authenticate,
  requireTenant,
  requirePermission("GATEWAY_PROVISION"),
  controller.create,
);
router.get(
  "/gateways/:id",
  authenticate,
  requireTenant,
  requirePermission("GATEWAY_VIEW"),
  controller.detail,
);
router.patch(
  "/gateways/:id",
  authenticate,
  requireTenant,
  requirePermission("GATEWAY_PROVISION"),
  controller.update,
);
router.delete(
  "/gateways/:id",
  authenticate,
  requireTenant,
  requirePermission("GATEWAY_PROVISION"),
  controller.remove,
);

// Per-device ingest credentials. Guarded by DEVICE_PROVISION rather than
// DEVICE_CONFIGURE: minting a credential that can write telemetry is a
// provisioning act, not a settings change.
router.get(
  "/devices/:deviceId/credentials",
  authenticate,
  requireTenant,
  requirePermission("DEVICE_PROVISION"),
  controller.listDeviceCredentials,
);
router.post(
  "/devices/:deviceId/credentials",
  authenticate,
  requireTenant,
  requirePermission("DEVICE_PROVISION"),
  controller.issueDeviceCredential,
);
router.delete(
  "/devices/:deviceId/credentials/:credentialId",
  authenticate,
  requireTenant,
  requirePermission("DEVICE_PROVISION"),
  controller.revokeDeviceCredential,
);

export default router;
