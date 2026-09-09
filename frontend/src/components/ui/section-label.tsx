import { cn } from "@/lib/utils";

interface SectionLabelProps {
  index?: string;
  label: string;
  className?: string;
  light?: boolean;
}

export function SectionLabel({ index, label, className, light }: SectionLabelProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {index && (
        <span
          className={cn(
            "font-mono text-[11px] font-medium tracking-widest",
            light ? "text-shm-navy-300" : "text-shm-navy-500"
          )}
        >
          {index}
        </span>
      )}
      <span
        className={cn(
          "font-mono text-[11px] font-semibold uppercase tracking-[0.22em]",
          light ? "text-slate-300" : "text-slate-500"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "h-px flex-1",
          light ? "bg-white/15" : "bg-slate-200"
        )}
      />
    </div>
  );
}