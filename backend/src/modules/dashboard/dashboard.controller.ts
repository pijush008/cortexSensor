import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as dashboardService from "./dashboard.service";
import { dashboardBodySchema, graphBodySchema } from "./dashboard.types";
import { ForbiddenError } from "../../utils/AppError";
import { redisGet, redisSet } from "../../config/redis";

const DASHBOARD_CACHE_TTL = 30; // seconds

function handleControllerError(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  const message = err.message || "Something Went Wrong";
  const errorMessage = message.replace(/"/g, "");
  return res.status(statusCode).json({
    status_code: statusCode,
    message: errorMessage,
    error: statusCode === 500 ? null : undefined,
  });
}

/**
 * Identity comes from the authenticated session, never from the request body.
 * The body keeps userId/userType for legacy-client compatibility, but they are
 * ignored to prevent cross-tenant data access via arbitrary id/userType pairs.
 */
function resolveIdentity(req: AuthRequest): { userId: string; userType: string } {
  if (!req.user) {
    throw new ForbiddenError("You do not have permission to view this data");
  }
  return {
    userId: String(req.user.id),
    userType: req.user.userType,
  };
}

export async function dashboard(req: AuthRequest, res: Response) {
  try {
    const result = dashboardBodySchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const identity = resolveIdentity(req);
    const cacheKey = `dash:${identity.userType}:${identity.userId}`;
    const cached = await redisGet(cacheKey);
    if (cached) {
      try {
        return res.status(200).json(JSON.parse(cached));
      } catch { /* fall through to DB */ }
    }
    const response = await dashboardService.getDashboard(identity.userId, identity.userType);
    await redisSet(cacheKey, JSON.stringify(response), DASHBOARD_CACHE_TTL);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function projectGraph(req: AuthRequest, res: Response) {
  try {
    const result = graphBodySchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const { type } = result.data;
    const identity = resolveIdentity(req);
    const data = await dashboardService.getProjectGraph(identity.userId, identity.userType, type);
    return res.status(200).json({ status_code: 200, message: "success", data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function deviceGraph(req: AuthRequest, res: Response) {
  try {
    const result = graphBodySchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const { type } = result.data;
    const identity = resolveIdentity(req);
    const data = await dashboardService.getDeviceGraph(identity.userId, identity.userType, type);
    return res.status(200).json({ status_code: 200, message: "success", data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function sensorGraph(req: AuthRequest, res: Response) {
  try {
    const result = graphBodySchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const { type } = result.data;
    const identity = resolveIdentity(req);
    const data = await dashboardService.getSensorGraph(identity.userId, identity.userType, type);
    return res.status(200).json({ status_code: 200, message: "success", data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function userGraph(req: AuthRequest, res: Response) {
  try {
    const result = graphBodySchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const { type, desireUserType } = result.data;
    const identity = resolveIdentity(req);
    const data = await dashboardService.getUserGraph(
      identity.userId,
      identity.userType,
      type,
      desireUserType,
    );
    return res.status(200).json({ status_code: 200, message: "success", data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}
