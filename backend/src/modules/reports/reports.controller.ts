import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as reportsService from "./reports.service";
import { assertProjectAccessByUniqueId } from "../projects/projects.service";
import {
  reportSensorListSchema,
  reportSensorDataSchema,
  reportSensorListGraphSchema,
  reportSensorListMultipleGraphSchema,
} from "./reports.types";

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

export async function reportSensorList(req: AuthRequest, res: Response) {
  try {
    const { uniqueId } = req.params;
    await assertProjectAccessByUniqueId(uniqueId, req.user);
    const query = reportSensorListSchema.parse(req.body);
    const data = await reportsService.getReportSensorList(uniqueId, query);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function reportSensorData(req: AuthRequest, res: Response) {
  try {
    const { sensorId, uniqueId } = req.params;
    await assertProjectAccessByUniqueId(uniqueId, req.user);
    const query = reportSensorDataSchema.parse(req.body);
    const data = await reportsService.getReportSensorData(
      sensorId,
      uniqueId,
      query,
    );
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function reportSensorListGraph(req: AuthRequest, res: Response) {
  try {
    const { uniqueId } = req.params;
    await assertProjectAccessByUniqueId(uniqueId, req.user);
    const query = reportSensorListGraphSchema.parse(req.body);
    const data = await reportsService.getReportSensorListGraph(uniqueId, query);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function reportSensorListMultipleGraph(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { uniqueId } = req.params;
    await assertProjectAccessByUniqueId(uniqueId, req.user);
    const query = reportSensorListMultipleGraphSchema.parse(req.body);
    const data = await reportsService.getReportSensorListMultipleGraph(
      uniqueId,
      query,
    );
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}
