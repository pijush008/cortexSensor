import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as sensorsService from "./sensors.service";
import { auditLogger } from "../../utils/audit";
import {
  sensorAddSchema,
  sensorTypeAddSchema,
  sensorUpdateSchema,
  sensorTypeUpdateSchema,
  sensorListQuerySchema,
  sensorDataFromDeviceSchema,
  assignSensorAdminSchema,
} from "./sensors.types";

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

export async function sensorList(req: AuthRequest, res: Response) {
  try {
    const query = sensorListQuerySchema.parse(req.query);
    const user = req.user;

    let scopedAdminId: number | undefined;
    if (user && user.userType !== "superadmin") {
      if (user.userType !== "admin") {
        return res.status(403).json({
          status_code: 403,
          message: "You do not have permission to view sensors",
        });
      }
      scopedAdminId = user.id;
    }

    const data = await sensorsService.sensorList(query, scopedAdminId);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function sensorListOnType(req: AuthRequest, res: Response) {
  try {
    let { assignType, adminId } = req.params;
    const user = req.user;

    if (user && user.userType !== "superadmin") {
      if (user.userType !== "admin") {
        return res.status(403).json({
          status_code: 403,
          message: "You do not have permission to view sensors",
        });
      }
      adminId = String(user.id);
    }

    const query = sensorListQuerySchema.parse(req.query);
    const data = await sensorsService.sensorListOnType(assignType, adminId, query);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function sensorAddNew(req: AuthRequest, res: Response) {
  try {
    const result = sensorAddSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await sensorsService.addSensor(result.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "create",
      entity: "sensor",
      newValue: { sensorName: result.data.sensorName },
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function updateSensor(req: AuthRequest, res: Response) {
  try {
    const { sensorId } = req.params;
    const result = sensorUpdateSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await sensorsService.updateSensor(sensorId, result.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "update",
      entity: "sensor",
      entityId: Number(sensorId),
      newValue: { sensorName: result.data.sensorName },
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function deleteSensor(req: AuthRequest, res: Response) {
  try {
    const { sensorId } = req.params;
    const response = await sensorsService.deleteSensor(sensorId);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "delete",
      entity: "sensor",
      entityId: Number(sensorId),
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function assignSensorToAdmin(req: AuthRequest, res: Response) {
  try {
    const result = assignSensorAdminSchema.parse(req.query);
    const response = await sensorsService.assignSensorToAdmin(result);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function unassignSensorFromAdmin(
  req: AuthRequest,
  res: Response,
) {
  try {
    const result = assignSensorAdminSchema.parse(req.query);
    const response = await sensorsService.unassignSensorFromAdmin(result);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function sensorTypeList(req: AuthRequest, res: Response) {
  try {
    const { searchTerm } = req.query;
    const data = await sensorsService.sensorTypeList(
      searchTerm as string | undefined,
    );
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function sensorTypeAddNew(req: AuthRequest, res: Response) {
  try {
    const result = sensorTypeAddSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await sensorsService.addSensorType(result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function updateSensorType(req: AuthRequest, res: Response) {
  try {
    const { sensorTypeId } = req.params;
    const result = sensorTypeUpdateSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await sensorsService.updateSensorType(
      sensorTypeId,
      result.data,
    );
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function deleteSensorType(req: AuthRequest, res: Response) {
  try {
    const { sensorTypeId } = req.params;
    const response = await sensorsService.deleteSensorType(sensorTypeId);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function sensorDataFromDevice(req: AuthRequest, res: Response) {
  try {
    const result = sensorDataFromDeviceSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await sensorsService.addSensorDataFromDevice(result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}
