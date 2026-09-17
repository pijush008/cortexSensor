import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PulseTone = "green" | "yellow" | "red" | "blue" | "slate";

/** Green is a tick in a circle, not a dot — see status-badge.tsx for why. */
const TONES: Record<PulseTone, { dot: string; ring: string; check?: boolean }> = {
  green: { dot: "bg-shm-green", ring: "anim-sonar-green", check: true },
  yellow: { dot: "bg-shm-yellow", ring: "anim-sonar-yellow" },
  red: { dot: "bg-shm-red", ring: "anim-sonar-red" },
  blue: { dot: "bg-shm-navy-500", ring: "anim-sonar-blue" },
  slate: { dot: "bg-slate-400", ring: "" },
};

interface PulseDotProps {
  tone?: PulseTone;
  pulse?: boolean;
  className?: string;
  label?: string;
}

export function PulseDot({ tone = "blue", pulse = true, className, label }: PulseDotProps) {
  const t = TONES[tone] ?? TONES.slate;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* rounded-full so the sonar box-shadow rings the mark instead of boxing it */}
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full",
          t.check ? "h-3 w-3" : "h-2 w-2",
          pulse && t.ring,
        )}
        aria-hidden="true"
      >
        {t.check ? (
          <CheckCircle2 className="h-3 w-3 text-shm-green" strokeWidth={2.5} />
        ) : (
          <span className={cn("absolute inset-0 rounded-full", t.dot)} />
        )}
      </span>
      {label && <span className="text-xs">{label}</span>}
    </span>
  );
}