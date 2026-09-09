import { Router } from "express";
import { authenticate, superAdminOnly } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { ensureSensorAccess } from "../../middleware/tenant";
import * as sensorsController from "./sensors.controller";
import * as lifecycleController from "./sensor-lifecycle.controller";
import { requirePermission as requirePerm, requireTenant } from "../../middleware/authorize";

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
// Placement and calibration history (§16, §32). Append-only records that change
// the meaning of past measurements, so they are guarded separately from
// ordinary sensor edits.
//
// Declared BEFORE the "/:assignType/:adminId" catch-all below: both are
// two-segment patterns, so Express would otherwise match the catch-all first
// and reject "/12/calibrations" as an invalid assignType.
router.get(
  "/:sensorId/assignments",
  authenticate,
  requireTenant,
  requirePerm("SENSOR_VIEW"),
  lifecycleController.assignmentHistory,
);
router.post(
  "/:sensorId/assignments",
  authenticate,
  requireTenant,
  requirePerm("SENSOR_CONFIGURE"),
  lifecycleController.assign,
);
router.get(
  "/:sensorId/calibrations",
  authenticate,
  requireTenant,
  requirePerm("SENSOR_VIEW"),
  lifecycleController.calibrationHistory,
);
router.post(
  "/:sensorId/calibrations",
  authenticate,
  requireTenant,
  requirePerm("SENSOR_CALIBRATE"),
  lifecycleController.calibrate,
);

router.get(
  "/:assignType/:adminId",
  authenticate,
  requirePermission("VIEW_SENSORS"),
  sensorsController.sensorListOnType,
);

export default router;
