import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Three tiers, not one.
 *
 * Every card previously carried the same radius and the same soft grey shadow,
 * so a live reading, a grouping panel and a plain container all announced
 * themselves equally and nothing read as more important than anything else.
 *
 *   reading  — holds a measurement. An ink hairline, no shadow: it sits flat on
 *              the page like a panel on an instrument.
 *   panel    — groups other things. Recessive, no border, faint ground.
 *   alert    — a limit has been crossed. The only tier that raises its voice.
 *
 * `surface` is the unchanged original, kept for the pages not yet moved over.
 */
type CardTone = "surface" | "reading" | "panel" | "alert";

const TONES: Record<CardTone, string> = {
  surface:
    "rounded-xl border border-slate-200/90 bg-white " +
    "shadow-[0_1px_2px_rgba(17,17,17,0.04)] " +
    "hover:border-slate-300 hover:shadow-[0_6px_24px_-12px_rgba(17,17,17,0.18)]",
  reading:
    "rounded-lg border border-shm-navy-900/15 bg-white " +
    "hover:border-shm-navy-900/35",
  panel: "rounded-lg border border-transparent bg-shm-sky-50",
  alert:
    "rounded-lg border border-shm-red/45 bg-shm-red-soft " +
    "shadow-[0_0_0_1px_rgba(200,30,30,0.08)]",
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, tone = "surface", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "transition-[border-color,box-shadow] duration-200 ease-out",
        TONES[tone],
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col space-y-1 px-5 pb-0 pt-5",
        className
      )}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        "text-[0.9375rem] font-semibold tracking-tight text-slate-900 leading-snug",
        className
      )}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-[0.8125rem] text-slate-500", className)}
      {...props}
    />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-5 pb-5 pt-4", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardDescription, CardContent };