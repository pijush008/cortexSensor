import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { requirePermission, requireTenant } from "../../middleware/authorize";
import * as controller from "./structures.controller";

/**
 * Structures and their monitoring locations.
 *
 * Guarded by permissions rather than role names, so adding a role never
 * requires revisiting this file. Every handler is additionally tenant-scoped in
 * the service layer — the permission says WHAT you may do, the tenant scope
 * says WHICH rows you may do it to. Both are required.
 */
const router = Router();

router.get(
  "/structures",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_VIEW"),
  controller.list,
);
router.post(
  "/structures",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_CREATE"),
  controller.create,
);
router.get(
  "/structures/:id",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_VIEW"),
  controller.detail,
);
router.patch(
  "/structures/:id",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_EDIT"),
  controller.update,
);
router.delete(
  "/structures/:id",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_DELETE"),
  controller.remove,
);

router.get(
  "/structures/:id/locations",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_VIEW"),
  controller.listLocations,
);
router.post(
  "/structures/:id/locations",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_EDIT"),
  controller.createLocation,
);
router.patch(
  "/locations/:locationId",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_EDIT"),
  controller.updateLocation,
);
router.delete(
  "/locations/:locationId",
  authenticate,
  requireTenant,
  requirePermission("STRUCTURE_EDIT"),
  controller.removeLocation,
);

export default router;
