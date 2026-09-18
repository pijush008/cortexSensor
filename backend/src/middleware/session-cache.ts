import type { Request } from "express";
import { loadSessionUser, type SessionUser } from "../modules/rbac/rbac.service";

/**
 * One session lookup per request, shared by every middleware that needs it.
 *
 * `restrictDirectoryOnlySessions` and `authenticate` both have to identify the
 * caller, and both run on every request. Each doing its own lookup meant the
 * same row fetched twice — over a remote database, twice the latency. The
 * first caller loads it; the rest read it from the request.
 *
 * Keyed by user id rather than stored bare, because a view-as session changes
 * which user the request is acting as part-way through the chain.
 */

interface CachedRequest extends Request {
  __sessionUsers?: Map<number, Promise<SessionUser | null>>;
}

export function getSessionUser(req: Request, userId: number): Promise<SessionUser | null> {
  const r = req as CachedRequest;
  if (!r.__sessionUsers) r.__sessionUsers = new Map();
  let pending = r.__sessionUsers.get(userId);
  if (!pending) {
    pending = loadSessionUser(userId);
    r.__sessionUsers.set(userId, pending);
  }
  return pending;
}
