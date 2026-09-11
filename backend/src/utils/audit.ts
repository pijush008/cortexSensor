import { Request } from "express";
import prisma from "../config/prisma";
import type { Prisma } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth";

export type AuditEntity =
  | "user"
  | "project"
  | "device"
  | "sensor"
  | "deviceChannel"
  | "gateway"
  | "alert"
  | "report"
  | "inspection"
  | "analysis"
  | "baseline"
  | "structure"
  | "location"
  | "sensorData"
  | "subscription"
  | "projectInvitation";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "deactivate"
  | "verify"
  | "assign"
  | "unassign"
  | "subscription-update"
  // Both ends of a platform operator's view-as session. Recorded against the
  // OPERATOR, never the person viewed, so a customer's trail never gains an
  // entry they did not cause.
  | "impersonate-start"
  | "impersonate-end";

interface AuditInput {
  userId?: number;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: number;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        oldValue: input.oldValue as Prisma.InputJsonValue | undefined,
        newValue: input.newValue as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit must never break the primary operation.
    const error = err as { message?: string };
    // Repeated create failures (e.g. missing table) would spam the log.
    // Keep it silent but tracked via console in dev.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[audit] failed to write audit log (${input.entity}/${input.action}): ${
          error?.message ?? "unknown"
        }`,
      );
    }
  }
}

/** Helper to derive audit caller context from an Express request. */
function requestContext(req?: AuthRequest | Request) {
  if (!req) return { ipAddress: undefined, userAgent: undefined };
  return {
    // req.ip, not the raw X-Forwarded-For header. Express resolves req.ip using
    // the configured `trust proxy` hop count, so it reflects the proxies we
    // actually operate. Reading the header directly accepted whatever a client
    // chose to send, which let anyone write a false address into the audit log —
    // the one record whose job is to say who did something.
    ipAddress: req.ip ?? req.socket?.remoteAddress,
    userAgent: req.headers["user-agent"] as string | undefined,
  };
}

export const auditLogger = { audit, requestContext };