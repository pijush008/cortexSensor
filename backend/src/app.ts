import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "./config/redisStore";
import cookieParser from "cookie-parser";
import path from "path";
import { config } from "./config";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import devicesRoutes from "./modules/devices/devices.routes";
import sensorsRoutes from "./modules/sensors/sensors.routes";
import sensorTypesRoutes from "./modules/sensors/sensorTypes.routes";
import assignRoutes from "./modules/sensors/assign.routes";
import projectsRoutes from "./modules/projects/projects.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import exportsRoutes from "./modules/exports/exports.routes";
import iotRoutes from "./modules/iot/iot.routes";
import subscriptionRoutes from "./modules/subscription/subscription.routes";
import { authenticate } from "./middleware/auth";
import { requireApiKey } from "./middleware/apiKey";
import prisma from "./config/prisma";
import { formatImageUrl } from "./utils/helper";
import * as sensorsController from "./modules/sensors/sensors.controller";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore(),
});
app.use(limiter);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

app.use("/api/uploads", express.static(path.resolve("uploads")));

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "SHM API" });
});

app.use("/api", authRoutes);
app.use("/api", usersRoutes);
app.use("/api/device", devicesRoutes);
app.use("/api/sensor", sensorsRoutes);
app.use("/api/sensorType", sensorTypesRoutes);
app.use("/api", assignRoutes);
app.use("/api", projectsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", reportsRoutes);
app.use("/api", exportsRoutes);
app.use("/api", iotRoutes);
app.use("/api", subscriptionRoutes);

app.get("/api/deviceType", authenticate, async (req, res) => {
  try {
    const searchTerm = req.query.searchTerm as string | undefined;
    const where: Record<string, unknown> = { status: "one" as never };
    if (searchTerm) {
      where.deviceType = { contains: searchTerm, mode: "insensitive" };
    }
    const rows = await prisma.deviceType.findMany({
      where: where as never,
      select: { id: true, deviceType: true, deviceImage: true },
    });
    const result = rows.map((d) => ({
      deviceTypeId: d.id,
      deviceType: d.deviceType,
      deviceImage: formatImageUrl(d.deviceImage),
    }));
    if (!result.length) {
      return res.status(404).json({ status_code: 404, message: "No Device type found", data: [] });
    }
    return res.status(200).json({ status_code: 200, message: null, data: result });
  } catch (error) {
    const err = error as { message: string };
    return res.status(400).json({ status_code: 400, message: "Something Went Wrong", data: err.message });
  }
});

app.post("/api/sensorDataFromDevice", requireApiKey, sensorsController.sensorDataFromDevice);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
