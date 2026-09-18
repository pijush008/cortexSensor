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
// What the gateway's nodes are reporting right now.
router.get(
  "/gateways/:id/telemetry",
  authenticate,
  requireTenant,
  requirePermission("GATEWAY_VIEW"),
  controller.telemetry,
);
// Minting the URL a gateway pushes to is a provisioning act.
router.post(
  "/gateways/:id/ingest-token",
  authenticate,
  requireTenant,
  requirePermission("GATEWAY_PROVISION"),
  controller.issueIngestToken,
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
