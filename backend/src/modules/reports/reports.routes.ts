import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import * as reportsController from "./reports.controller";

const router = Router();

router.post(
  "/reportSensorList/:uniqueId",
  authenticate,
  requirePermission("PROJECT_REPORTS"),
  reportsController.reportSensorList,
);
router.post(
  "/reportSensorData/:sensorId/:uniqueId",
  authenticate,
  requirePermission("PROJECT_REPORTS"),
  reportsController.reportSensorData,
);
router.post(
  "/reportSensorListGraph/:uniqueId",
  authenticate,
  requirePermission("PROJECT_REPORTS"),
  reportsController.reportSensorListGraph,
);
router.post(
  "/reportSensorListGraphComparison/:uniqueId",
  authenticate,
  requirePermission("PROJECT_REPORTS"),
  reportsController.reportSensorListMultipleGraph,
);

export default router;
