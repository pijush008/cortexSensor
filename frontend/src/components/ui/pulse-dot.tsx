import { cn } from "@/lib/utils";

type PulseTone = "green" | "yellow" | "red" | "blue" | "slate";

const TONES: Record<PulseTone, { dot: string; ring: string }> = {
  green: { dot: "bg-shm-green", ring: "anim-sonar-green" },
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
      <span
        className={cn("relative flex h-2 w-2", pulse && t.ring)}
        aria-hidden="true"
      >
        <span className={cn("absolute inset-0 rounded-full", t.dot)} />
      </span>
      {label && <span className="text-xs">{label}</span>}
    </span>
  );
}