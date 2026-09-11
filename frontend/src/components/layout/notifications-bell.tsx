"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAlerts } from "@/hooks/use-alerts";
import type { AlertRecord, AlertSeverity } from "@/types";

/**
 * The header bell.
 *
 * It used to be a button with no handler sitting under a permanently animated
 * red dot — an indicator that claimed unread work on every page of the app and
 * did nothing when clicked. The badge is now driven by the number of ACTIVE
 * alerts, so an empty platform shows a plain bell, and the panel lists those
 * alerts with a way through to each one.
 */

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  critical: "bg-shm-red",
  high: "bg-shm-red",
  medium: "bg-shm-yellow",
  low: "bg-shm-navy-500",
  info: "bg-slate-400",
};

/** Enough to show what is waiting without turning the panel into the page. */
const PANEL_LIMIT = 6;

function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: alerts = [] } = useAlerts({ activeOnly: true });
  const count = alerts.length;

  // Close on an outside click or Escape, the two ways anyone dismisses a
  // popover without thinking about it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = alerts.slice(0, PANEL_LIMIT);

  return (
    <div className="relative" ref={wrapRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative text-slate-500"
        aria-label={count > 0 ? `Notifications, ${count} active` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute right-2 top-2 flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full bg-shm-red opacity-60"
              style={{ animationDuration: "2.4s" }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-shm-red" />
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_-12px_rgba(17,17,17,0.28)]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-[0.8125rem] font-semibold text-slate-900">Active alerts</p>
            <span className="font-mono text-[0.6875rem] tabular-nums text-slate-500">
              {count}
            </span>
          </div>

          {shown.length === 0 ? (
            <p className="px-4 py-6 text-center text-[0.8125rem] text-slate-500">
              Nothing needs attention right now.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {shown.map((a: AlertRecord) => (
                <li key={a.id}>
                  <Link
                    href="/alerts"
                    onClick={() => setOpen(false)}
                    className="flex gap-2.5 border-b border-slate-50 px-4 py-3 transition-colors last:border-0 hover:bg-slate-50"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8125rem] font-medium text-slate-800">
                        {a.title}
                      </span>
                      <span className="mt-0.5 block font-mono text-[0.65625rem] uppercase tracking-[0.14em] text-slate-400">
                        {a.severity} · {timeAgo(a.detectedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/alerts"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-[0.8125rem] font-medium text-shm-navy-700 hover:bg-slate-50"
          >
            View all alerts
          </Link>
        </div>
      )}
    </div>
  );
}
