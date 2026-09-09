import { Router } from "express";
import { authenticate, superAdminOnly } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { ensureDeviceAccess } from "../../middleware/tenant";
import * as devicesController from "./devices.controller";

const router = Router();

router.post("/", authenticate, superAdminOnly, devicesController.addNewDevice);
router.get(
  "/",
  authenticate,
  requirePermission("VIEW_DEVICES"),
  devicesController.devicesList,
);
router.patch(
  "/:deviceId",
  authenticate,
  requirePermission("MANAGE_DEVICES"),
  ensureDeviceAccess,
  devicesController.updateDevice,
);
router.delete(
  "/:deviceId",
  authenticate,
  superAdminOnly,
  devicesController.deviceDelete,
);

router.post(
  "/assignSensor",
  authenticate,
  requirePermission("MANAGE_DEVICES"),
  devicesController.assignNewSensor,
);
router.delete(
  "/assignSensor",
  authenticate,
  requirePermission("MANAGE_DEVICES"),
  devicesController.assignDeleteSensor,
);

router.post(
  "/:assignType",
  authenticate,
  superAdminOnly,
  devicesController.assignDeviceToAdmin,
);

export default router;
