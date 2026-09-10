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
            light ? "text-sheet-rule" : "text-sheet-rule"
          )}
        >
          {index}
        </span>
      )}
      <span
        className={cn(
          "font-mono text-[11px] font-semibold uppercase tracking-[0.22em]",
          light ? "text-sheet-paper/70" : "text-sheet-ink/55"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "h-px flex-1",
          light ? "bg-sheet-paper/20" : "bg-sheet-ink/15"
        )}
      />
    </div>
  );
}