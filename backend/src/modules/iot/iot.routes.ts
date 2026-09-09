import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { requireApiKey } from "../../middleware/apiKey";
import * as iotController from "./iot.controller";

const router = Router();

router.get("/beamNodeData", authenticate, iotController.getNodeData);
router.get("/beamGetSensorData", authenticate, iotController.getSensorData);
router.delete("/beamNodeData", authenticate, iotController.deleteNodeData);
router.post("/beamDeviceData", requireApiKey, iotController.createNetworkDataFromDevice);

export default router;
