import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import * as exportsController from "./exports.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/download/list/:userType/:adminId",
  authenticate,
  requirePermission("VIEW_USERS"),
  exportsController.downloadAdminList,
);

router.post(
  "/download/device/:adminId",
  authenticate,
  requirePermission("VIEW_DEVICES"),
  exportsController.downloadDeviceList,
);

router.post(
  "/download/sensor/:adminId",
  authenticate,
  requirePermission("VIEW_SENSORS"),
  exportsController.downloadSensorList,
);

router.post(
  "/download/projects/:adminId",
  authenticate,
  requirePermission("VIEW_PROJECTS"),
  exportsController.downloadProjectTable,
);

router.post(
  "/exportCsv/:uniqueId",
  authenticate,
  requirePermission("PROJECT_REPORTS"),
  exportsController.exportCsv,
);

router.post(
  "/importCsv/:uniqueId",
  authenticate,
  upload.array("csvFiles"),
  requirePermission("MANAGE_PROJECTS"),
  exportsController.importCsv,
);

// Raw field telemetry downloads (office CSV export of sensor / node data)
router.post(
  "/download/sensorData",
  authenticate,
  requirePermission("PROJECT_REPORTS"),
  exportsController.downloadSensorData,
);

router.post(
  "/download/nodeData",
  authenticate,
  requirePermission("PROJECT_REPORTS"),
  exportsController.downloadNodeData,
);

export default router;
