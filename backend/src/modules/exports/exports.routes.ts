import { Router } from "express";
import multer from "multer";
import { config } from "../../config";
import { authenticate } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import * as exportsController from "./exports.controller";

const router = Router();
/**
 * CSV import uploads, held in memory.
 *
 * LIMITS ARE THE POINT. memoryStorage with no bounds means a request body is
 * buffered into the heap until it ends, so a single caller can exhaust the
 * process by sending a large enough upload — no vulnerability required, just
 * the default configuration. Several of multer's DoS advisories describe
 * variations on that theme; a cap closes the general case rather than each
 * reported instance of it.
 *
 * maxFileSize is the same MAX_FILE_SIZE the rest of the app honours (10 MB by
 * default). The file count is bounded too, since a limit per file is no limit
 * at all when the count is unbounded.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize,
    files: 10,
    // Field names are the vector in the "crafted multipart field names"
    // advisories; nothing here needs long ones.
    fieldNameSize: 200,
  },
});

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
