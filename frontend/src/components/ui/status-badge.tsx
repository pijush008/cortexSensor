import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "green" | "slate" | "yellow" | "red" | "blue";

/**
 * Green is the one tone drawn as a tick in a circle rather than a dot. A dot
 * only says "some state"; the tick says which one, so Active / Online / Paid
 * read without the label. The other tones stay dots — a cross for red would
 * imply an action, and yellow has no glyph that reads at this size.
 */
const TONES: Record<
  StatusTone,
  { pill: string; dot: string; pulse?: boolean; check?: boolean }
> = {
  green: { pill: "bg-shm-green/10 text-shm-green-text", dot: "bg-shm-green", check: true },
  slate: { pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  yellow: { pill: "bg-shm-yellow/12 text-amber-700", dot: "bg-shm-yellow", pulse: true },
  red: { pill: "bg-shm-red/10 text-shm-red", dot: "bg-shm-red", pulse: true },
  blue: { pill: "bg-shm-navy-500/10 text-shm-navy-700", dot: "bg-shm-navy-500" },
};

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  className?: string;
  pulse?: boolean;
}

export function StatusBadge({ label, tone = "slate", className, pulse }: StatusBadgeProps) {
  const t = TONES[tone] ?? TONES.slate;
  const shouldPulse = pulse ?? t.pulse;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider",
        t.pill,
        className,
      )}
    >
      {t.check ? (
        <CheckCircle2
          className="h-3 w-3 shrink-0 text-shm-green"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      ) : (
        <span className="relative flex h-1.5 w-1.5">
          {shouldPulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                t.dot
              )}
              style={{ animationDuration: "1.8s" }}
            />
          )}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", t.dot)} />
        </span>
      )}
      {label}
    </span>
  );
}