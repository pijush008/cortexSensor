import { Router } from "express";
import { authenticate, superAdminOnly } from "../../middleware/auth";
import * as devicesService from "../devices/devices.service";
import * as sensorsService from "../sensors/sensors.service";
import { assignDeviceQuerySchema } from "../devices/devices.types";
import { assignSensorAdminSchema } from "../sensors/sensors.types";

const router = Router();

router.post("/device/:assignType", authenticate, superAdminOnly, async (req, res) => {
  try {
    const { assignType } = req.params;
    const result = assignDeviceQuerySchema.parse(req.query);
    const response = await devicesService.assignDeviceToAdmin(
      assignType,
      result.deviceId,
      result.adminId,
    );
    return res.status(200).json(response);
  } catch (error) {
    const err = error as { statusCode?: number; message: string };
    return res.status(err.statusCode || 400).json({
      status_code: err.statusCode || 400,
      message: err.message.replace(/"/g, ""),
    });
  }
});

router.post("/sensor/:assignType", authenticate, superAdminOnly, async (req, res) => {
  try {
    const { assignType } = req.params;
    const result = assignSensorAdminSchema.parse(req.query);
    const response =
      assignType === "assign"
        ? await sensorsService.assignSensorToAdmin(result)
        : await sensorsService.unassignSensorFromAdmin(result);
    return res.status(200).json(response);
  } catch (error) {
    const err = error as { statusCode?: number; message: string };
    return res.status(err.statusCode || 400).json({
      status_code: err.statusCode || 400,
      message: err.message.replace(/"/g, ""),
    });
  }
});

export default router;
