import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import * as dashboardController from "./dashboard.controller";

const router = Router();

router.post("/", authenticate, dashboardController.dashboard);
router.post("/project_graph", authenticate, dashboardController.projectGraph);
router.post("/device_graph", authenticate, dashboardController.deviceGraph);
router.post("/sensor_graph", authenticate, dashboardController.sensorGraph);
router.post("/user_graph", authenticate, dashboardController.userGraph);

export default router;
