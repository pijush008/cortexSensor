import { cn } from "@/lib/utils";

interface SectionLabelProps {
  /**
   * Accepted and ignored.
   *
   * Eighteen of these carried a global running number — "31" beside a date
   * picker, "18" above a backup list — on content that is not a sequence. A
   * reader learns nothing from them, and they are one of the clearest marks of
   * a generated layout. Kept in the signature so call sites need not all change
   * at once; it renders nothing.
   */
  index?: string;
  label: string;
  className?: string;
  light?: boolean;
}

/**
 * Names a section when a page holds more than one KIND of content.
 *
 * Not an ornament above every heading. Where a card already has a title, this
 * says the same thing twice in a louder voice, so it should simply be absent.
 */
export function SectionLabel({ label, className, light }: SectionLabelProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "text-caption font-medium",
          light ? "text-sheet-paper/70" : "text-slate-500"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "h-px flex-1",
          light ? "bg-sheet-paper/20" : "bg-slate-200"
        )}
        aria-hidden
      />
    </div>
  );
}
