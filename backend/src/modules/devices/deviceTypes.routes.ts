import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import * as devicesService from "./devices.service";
import { assignDeviceQuerySchema } from "./devices.types";
import { assignSensorAdminSchema } from "../sensors/sensors.types";
import * as sensorsService from "../sensors/sensors.service";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { searchTerm } = req.query;
    const data = await (await import("../sensors/sensors.service")).sensorTypeList(
      searchTerm as string | undefined,
    );
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    const err = error as { statusCode?: number; message: string };
    return res.status(err.statusCode || 400).json({
      status_code: err.statusCode || 400,
      message: err.message.replace(/"/g, ""),
    });
  }
});

export default router;
