import { Router } from "express";
import { authenticate, superAdminOnly } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { ensureSensorAccess } from "../../middleware/tenant";
import * as sensorsController from "./sensors.controller";

const router = Router();

router.get(
  "/",
  authenticate,
  requirePermission("VIEW_SENSORS"),
  sensorsController.sensorList,
);
router.post("/", authenticate, superAdminOnly, sensorsController.sensorAddNew);
router.patch(
  "/:sensorId",
  authenticate,
  requirePermission("MANAGE_SENSORS"),
  ensureSensorAccess,
  sensorsController.updateSensor,
);
router.delete(
  "/:sensorId",
  authenticate,
  superAdminOnly,
  sensorsController.deleteSensor,
);
router.get(
  "/:assignType/:adminId",
  authenticate,
  requirePermission("VIEW_SENSORS"),
  sensorsController.sensorListOnType,
);

export default router;
