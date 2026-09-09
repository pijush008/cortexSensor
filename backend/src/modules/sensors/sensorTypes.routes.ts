import { Router } from "express";
import { authenticate, superAdminOnly } from "../../middleware/auth";
import * as sensorsController from "./sensors.controller";

const router = Router();

router.get("/", authenticate, sensorsController.sensorTypeList);
router.post("/", authenticate, superAdminOnly, sensorsController.sensorTypeAddNew);
router.patch("/:sensorTypeId", authenticate, superAdminOnly, sensorsController.updateSensorType);
router.delete("/:sensorTypeId", authenticate, superAdminOnly, sensorsController.deleteSensorType);

export default router;
