import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as devicesService from "./devices.service";
import { getOrCreateOperatorTenant } from "../rbac/tenant.provisioning";
import { auditLogger } from "../../utils/audit";
import {
  deviceAddSchema,
  deviceUpdateSchema,
  assignSensorSchema,
  unassignSensorSchema,
  deviceListQuerySchema,
  assignDeviceQuerySchema,
} from "./devices.types";

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

export async function addNewDevice(req: AuthRequest, res: Response) {
  try {
    const result = deviceAddSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await devicesService.addDevice(result.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "create",
      entity: "device",
      newValue: { deviceName: result.data.deviceName, deviceId: result.data.deviceId },
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function devicesList(req: AuthRequest, res: Response) {
  try {
    const query = deviceListQuerySchema.parse(req.query);
    const user = req.user;

    let scopedAdminId: number | undefined;
    if (user && user.userType !== "superadmin") {
      if (user.userType !== "admin") {
        return res.status(403).json({
          status_code: 403,
          message: "You do not have permission to view devices",
        });
      }
      scopedAdminId = user.id;
    }

    // A platform operator is unscoped on the devices screen, which is right:
    // they administer every organization's hardware. But the PROJECT FORM asks
    // a narrower question — which devices could this project use — and for an
    // operator that means their own organization's, since that is where their
    // projects are created. Offering every device on the deployment would put
    // another customer's hardware in the chooser.
    let scopedTenantId = query.tenantId;
    if (scopedAdminId === undefined && query.availableForProject === "1") {
      scopedTenantId = await getOrCreateOperatorTenant();
    }

    const data = await devicesService.listDevices(
      { ...query, tenantId: scopedTenantId },
      scopedAdminId,
    );
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function updateDevice(req: AuthRequest, res: Response) {
  try {
    const { deviceId } = req.params;
    const result = deviceUpdateSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await devicesService.updateDevice(deviceId, result.data);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "update",
      entity: "device",
      entityId: Number(deviceId),
      newValue: { deviceName: result.data.deviceName },
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function deviceDelete(req: AuthRequest, res: Response) {
  try {
    const { deviceId } = req.params;
    const response = await devicesService.deleteDevice(deviceId);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "delete",
      entity: "device",
      entityId: Number(deviceId),
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function assignNewSensor(req: AuthRequest, res: Response) {
  try {
    const result = assignSensorSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await devicesService.assignSensor(result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function assignDeleteSensor(req: AuthRequest, res: Response) {
  try {
    const result = unassignSensorSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await devicesService.unassignSensor(result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function assignDeviceToAdmin(req: AuthRequest, res: Response) {
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
    return handleControllerError(res, error);
  }
}
