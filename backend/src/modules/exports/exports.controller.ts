import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as exportsService from "./exports.service";
import { assertProjectAccessByUniqueId } from "../projects/projects.service";
import { ForbiddenError } from "../../utils/AppError";
import {
  downloadListParamsSchema,
  downloadDeviceParamsSchema,
  downloadSensorParamsSchema,
  downloadProjectsParamsSchema,
  exportCsvParamsSchema,
  importCsvParamsSchema,
  downloadTelemetryBodySchema,
} from "./exports.types";

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

function handleControllerError(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  const message = err.message || "Something Went Wrong";
  const errorMessage = message.replace(/"/g, "");
  return res.status(statusCode).json({
    status_code: statusCode,
    message: errorMessage,
    data: statusCode === 500 ? null : undefined,
  });
}

/**
 * A non-superadmin may only ever export their own tenant-scoped rows.
 */
function resolveScopedAdminId(req: AuthRequest, requestedAdminId: string): string {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError("You do not have permission to export this data");
  }
  if (user.userType !== "superadmin") {
    return String(user.id);
  }
  return requestedAdminId;
}

export async function downloadAdminList(req: AuthRequest, res: Response) {
  try {
    const params = downloadListParamsSchema.parse(req.params);
    const body = req.body || {};
    const adminId = resolveScopedAdminId(req, params.adminId);
    const { csvContent, filename } = await exportsService.downloadAdminList(
      params.userType,
      adminId,
      body,
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}.csv`,
    );
    return res.send(csvContent);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function downloadDeviceList(req: AuthRequest, res: Response) {
  try {
    const params = downloadDeviceParamsSchema.parse(req.params);
    const body = req.body || {};
    const adminId = resolveScopedAdminId(req, params.adminId);
    const { csvContent, filename } = await exportsService.downloadDeviceList(
      adminId,
      body,
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}.csv`,
    );
    return res.send(csvContent);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function downloadSensorList(req: AuthRequest, res: Response) {
  try {
    const params = downloadSensorParamsSchema.parse(req.params);
    const body = req.body || {};
    const adminId = resolveScopedAdminId(req, params.adminId);
    const { csvContent, filename } = await exportsService.downloadSensorList(
      adminId,
      body,
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}.csv`,
    );
    return res.send(csvContent);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function downloadProjectTable(req: AuthRequest, res: Response) {
  try {
    const params = downloadProjectsParamsSchema.parse(req.params);
    const body = req.body || {};
    const adminId = resolveScopedAdminId(req, params.adminId);
    const { csvContent, filename } =
      await exportsService.downloadProjectTable(adminId, body);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}.csv`,
    );
    return res.send(csvContent);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function exportCsv(req: AuthRequest, res: Response) {
  try {
    const params = exportCsvParamsSchema.parse(req.params);
    await assertProjectAccessByUniqueId(params.uniqueId, req.user);
    const data = await exportsService.exportCsv(params.uniqueId);
    return res.status(200).json({ status_code: 200, message: null, data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function importCsv(req: AuthRequest, res: Response) {
  try {
    const params = importCsvParamsSchema.parse(req.params);
    await assertProjectAccessByUniqueId(params.uniqueId, req.user);
    const files = req.files as MulterFile[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({
        status_code: 400,
        message: "No files uploaded",
      });
    }
    const result = await exportsService.importCsv(params.uniqueId, files);
    return res.status(200).json({ status_code: 200, ...result });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

function parseTelemetryBody(rawBody: unknown) {
  return downloadTelemetryBodySchema.parse(rawBody && typeof rawBody === "object" ? rawBody : {});
}

export async function downloadSensorData(req: AuthRequest, res: Response) {
  try {
    const body = parseTelemetryBody(req.body || {});
    const { csvContent, filename } = await exportsService.downloadSensorData(
      body,
      req.user,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}.csv`,
    );
    return res.send(csvContent);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function downloadNodeData(req: AuthRequest, res: Response) {
  try {
    const body = parseTelemetryBody(req.body || {});
    const { csvContent, filename } = await exportsService.downloadNodeData(
      body,
      req.user,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${filename}.csv`,
    );
    return res.send(csvContent);
  } catch (error) {
    return handleControllerError(res, error);
  }
}
