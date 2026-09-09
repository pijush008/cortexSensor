import { Response, Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth";
import { requirePermission, requireTenant } from "../../middleware/authorize";
import { logger } from "../../utils/logger";
import { subscribeTenant, type StreamEvent } from "./event-bus";

/**
 * Server-sent events: the authenticated, tenant-filtered live feed.
 *
 * This exists to remove the browser from the MQTT broker entirely.
 *
 * The previous live view connected the browser straight to Mosquitto using
 * NEXT_PUBLIC_MQTT_USER / NEXT_PUBLIC_MQTT_PASS. Next.js inlines NEXT_PUBLIC_*
 * values into the client bundle, so that password was readable in page source
 * by anyone, and the default subscription was `shm/feed/#` — a wildcard across
 * every tenant. One shared, public credential granted every customer's live
 * telemetry (audit finding SEC-1).
 *
 * Here the server holds the broker credential, authenticates the session,
 * resolves the tenant from the user's membership, and forwards only that
 * tenant's events. A topic name is a routing convention; it is not
 * authorization (§10).
 *
 * SSE rather than WebSocket (§56): this stream is one-directional, it survives
 * proxies without an upgrade negotiation, and EventSource reconnects on its own.
 */

const router = Router();

/** Proxies and load balancers commonly drop a connection idle for 60s. */
const KEEPALIVE_MS = 25_000;

/**
 * A slow client must not become unbounded server memory. Beyond this backlog
 * the connection is closed rather than buffered indefinitely; EventSource will
 * reconnect and resume from live.
 */
const MAX_PENDING_EVENTS = 500;

function writeEvent(res: Response, event: StreamEvent): boolean {
  return res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

router.get(
  "/stream/measurements",
  authenticate,
  requireTenant,
  requirePermission("SHM_VIEW"),
  (req: AuthRequest, res: Response) => {
    const ctx = req.auth!;

    // A platform operator has no tenant, so there is no single stream to
    // subscribe them to. Refusing explicitly is clearer than silently
    // delivering nothing forever.
    if (ctx.tenantId === null) {
      res.status(400).json({
        status_code: 400,
        message:
          "Live streaming is scoped to an organization. Platform operators have no tenant stream.",
      });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells nginx not to buffer, which would otherwise hold events until the
      // response ended — i.e. never, for a stream.
      "X-Accel-Buffering": "no",
    });
    // Flush headers immediately so the client's onopen fires now rather than
    // when the first measurement happens to arrive.
    res.flushHeaders?.();

    res.write(
      `event: ready\ndata: ${JSON.stringify({
        tenantId: ctx.tenantId,
        // Told to the client so it can render "waiting for data" honestly
        // rather than implying a stalled connection.
        keepaliveSeconds: KEEPALIVE_MS / 1000,
      })}\n\n`,
    );

    let pending = 0;
    let closed = false;

    const unsubscribe = subscribeTenant(ctx.tenantId, (event) => {
      if (closed) return;
      pending += 1;
      if (pending > MAX_PENDING_EVENTS) {
        logger.warn(
          `SSE client for tenant ${ctx.tenantId} fell too far behind; closing`,
        );
        cleanup();
        res.end();
        return;
      }
      const flushed = writeEvent(res, event);
      if (flushed) pending = 0;
    });

    res.on("drain", () => {
      pending = 0;
    });

    const keepalive = setInterval(() => {
      if (closed) return;
      // A comment line: valid SSE, ignored by EventSource, and enough to stop
      // an idle proxy dropping the connection.
      res.write(`: keepalive ${Date.now()}\n\n`);
    }, KEEPALIVE_MS);

    function cleanup() {
      if (closed) return;
      closed = true;
      clearInterval(keepalive);
      unsubscribe();
    }

    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  },
);

export default router;
