"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live measurement stream over server-sent events.
 *
 * This replaces a direct browser→MQTT connection. That arrangement required a
 * broker password to be shipped inside the client bundle, where anyone could
 * read it, and subscribed to a topic wildcard that spanned every tenant. The
 * server now holds the broker credential, authenticates the session and
 * forwards only the caller's own tenant events (audit finding SEC-1).
 *
 * EventSource sends cookies when `withCredentials` is set, which is exactly
 * how the rest of the app authenticates — no token handling is needed here.
 */

export interface LiveMeasurement {
  type: "measurement";
  tenantId: number;
  sensorId: number;
  sensorName?: string | null;
  structureId: number | null;
  locationId: number | null;
  deviceId: number | null;
  ts: string;
  /** Null when the device reported a non-finite reading. */
  value: number | null;
  rawValue: number | null;
  unit?: string | null;
  qualityFlags: string[];
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "error";

interface Options {
  /** Ring-buffer size. Keeps an always-open dashboard from growing forever. */
  limit?: number;
  enabled?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export function useLiveStream({ limit = 200, enabled = true }: Options = {}) {
  const [events, setEvents] = useState<LiveMeasurement[]>([]);
  const [state, setState] = useState<ConnectionState>("idle");
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  // Tracks whether we ever connected, so a drop reads as "reconnecting"
  // rather than as a first-attempt failure.
  const hadOpenRef = useRef(false);

  const disconnect = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    hadOpenRef.current = false;
    setState("idle");
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!enabled) return;

    setState("connecting");
    const source = new EventSource(`${API_BASE}/v1/stream/measurements`, {
      withCredentials: true,
    });
    sourceRef.current = source;

    source.addEventListener("ready", () => {
      hadOpenRef.current = true;
      setState("open");
    });

    source.addEventListener("measurement", (raw) => {
      try {
        const event = JSON.parse((raw as MessageEvent).data) as LiveMeasurement;
        setLastEventAt(new Date());
        setEvents((prev) => [event, ...prev].slice(0, limit));
      } catch {
        // A malformed frame must not tear down a working stream.
      }
    });

    source.onerror = () => {
      // EventSource retries on its own; reflect that rather than implying the
      // feed is dead. Only a never-opened connection is reported as an error.
      setState(hadOpenRef.current ? "reconnecting" : "error");
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [enabled, limit]);

  return { events, state, lastEventAt, disconnect, clear };
}
