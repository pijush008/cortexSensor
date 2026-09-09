import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as iotService from "./iot.service";
import {
  beamDeviceDataSchema,
  sensorDataQuerySchema,
  deleteNodeDataSchema,
} from "./iot.types";

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

export async function getNodeData(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ status_code: 401, message: "Unauthorized" });
    }
    const data = await iotService.getNodeData(req.user.id, req.user.userType);
    return res.status(200).json(data);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function getSensorData(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ status_code: 401, message: "Unauthorized" });
    }
    const result = sensorDataQuerySchema.safeParse(req.query);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const data = await iotService.getSensorData(
      result.data.deviceId,
      result.data.GatewayDeviceId,
      req.user.id,
      req.user.userType,
    );
    return res.status(200).json(data);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function deleteNodeData(req: AuthRequest, res: Response) {
  try {
    const result = deleteNodeDataSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await iotService.deleteNodeData(result.data.idList);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function createNetworkDataFromDevice(
  req: AuthRequest,
  res: Response,
) {
  try {
    const result = beamDeviceDataSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await iotService.createNetworkDataFromDevice(result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}
