import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "./config/redisStore";
import cookieParser from "cookie-parser";
import path from "path";
import { config } from "./config";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { requestContext } from "./middleware/requestContext";
import healthRoutes from "./modules/health/health.routes";

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
import structuresRoutes from "./modules/structures/structures.routes";
import gatewaysRoutes from "./modules/gateways/gateways.routes";
import streamRoutes from "./modules/stream/stream.routes";
import measurementsRoutes from "./modules/measurements/measurements.routes";
import analysisRoutes from "./modules/analysis/analysis.routes";
import { authenticate } from "./middleware/auth";
import { requireApiKey } from "./middleware/apiKey";
import prisma from "./config/prisma";
import { formatImageUrl } from "./utils/helper";
import * as sensorsController from "./modules/sensors/sensors.controller";

const app = express();

// Correlation id first: everything downstream (including the rate limiter's
// rejections and the error handler) should be traceable.
app.use(requestContext);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
  }),
);

// Probes are mounted ahead of the rate limiter on purpose. A load balancer
// polling /health every second would otherwise consume the 500-per-15-minutes
// budget and get itself throttled, which reads as an unhealthy instance and
// pulls a perfectly good API out of rotation.
app.use(healthRoutes);

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

// API versioning (§98).
//
// Every route is mounted under BOTH /api/v1 (the versioned path all new
// clients should use) and bare /api (which the current frontend calls).
// Mounting the same routers twice, rather than redirecting, keeps cookies,
// CORS preflight and request bodies identical on both paths.
//
// The unversioned alias is deprecated: it exists so this change does not
// require a lockstep frontend deploy, and is removed once the client is moved.
const API_MOUNTS = ["/api/v1", "/api"] as const;

for (const base of API_MOUNTS) {
  app.use(base, authRoutes);
  app.use(base, usersRoutes);
  app.use(`${base}/device`, devicesRoutes);
  app.use(`${base}/sensor`, sensorsRoutes);
  app.use(`${base}/sensorType`, sensorTypesRoutes);
  app.use(base, assignRoutes);
  app.use(base, projectsRoutes);
  app.use(`${base}/dashboard`, dashboardRoutes);
  app.use(base, reportsRoutes);
  app.use(base, exportsRoutes);
  app.use(base, iotRoutes);
  app.use(base, subscriptionRoutes);
  app.use(base, structuresRoutes);
  app.use(base, gatewaysRoutes);
  app.use(base, measurementsRoutes);
  app.use(base, analysisRoutes);
  app.use(base, streamRoutes);
}

const deviceTypeHandler = async (req: express.Request, res: express.Response) => {
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
};

for (const base of API_MOUNTS) {
  app.get(`${base}/deviceType`, authenticate, deviceTypeHandler);
  app.post(`${base}/sensorDataFromDevice`, requireApiKey, sensorsController.sensorDataFromDevice);
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
