import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as mfaService from "./mfa.service";
import { UnauthorizedError } from "../../utils/AppError";

function fail(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  return res.status(statusCode).json({
    status_code: statusCode,
    message: (err.message || "Something went wrong").replace(/"/g, ""),
  });
}

export async function beginEnrolment(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) throw new UnauthorizedError("Unauthorized");
    const challenge = await mfaService.beginEnrolment(req.userId);
    // The secret is returned once, at enrolment, so the client can render a QR
    // code. It is never returned again by any other endpoint.
    return res.status(200).json({ status_code: 200, message: null, ...challenge });
  } catch (error) {
    return fail(res, error);
  }
}

export async function confirmEnrolment(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) throw new UnauthorizedError("Unauthorized");
    const token = String((req.body as { token?: string })?.token ?? "");
    await mfaService.confirmEnrolment(req.userId, token);
    return res
      .status(200)
      .json({ status_code: 200, message: "Multi-factor authentication enabled" });
  } catch (error) {
    return fail(res, error);
  }
}

export async function disable(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) throw new UnauthorizedError("Unauthorized");
    const token = String((req.body as { token?: string })?.token ?? "");
    await mfaService.disableMfa(req.userId, token);
    return res
      .status(200)
      .json({ status_code: 200, message: "Multi-factor authentication disabled" });
  } catch (error) {
    return fail(res, error);
  }
}
