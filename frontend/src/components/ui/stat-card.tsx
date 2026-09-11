"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { Card } from "./card";
import { CountUp } from "./count-up";
import { Sparkline } from "./sparkline";
import { cn } from "@/lib/utils";

/**
 * A single measured figure.
 *
 * The number leads. Every figure in this product is a measurement, and an
 * instrument is read by its numbers — so the value is the largest thing here
 * and its name sits beneath it, quietly. The previous arrangement put a
 * tracked-out uppercase label ABOVE the figure at the same visual weight,
 * which made the label compete with the reading it described.
 *
 * Figures are set in tabular numerals throughout. Proportional digits shift
 * width as values change, so a live count visibly jitters and a column of
 * numbers fails to align on its units.
 */

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  className?: string;
  accent?: "green" | "blue" | "yellow" | "red" | "purple" | "navy";
  delta?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  spark?: number[];
  animate?: boolean;
  href?: string;
  onClick?: () => void;
  /**
   * The figure has crossed a limit and needs to be seen from across the room.
   *
   * The one place this interface raises its voice. Everything else stays quiet
   * so that an exceedance cannot be mistaken for ordinary state.
   */
  exceeded?: boolean;
}

/** Rule colour under the figure. Ink by default; accents only ever tint. */
const ACCENTS: Record<string, string> = {
  green: "bg-shm-green",
  blue: "bg-shm-navy-500",
  yellow: "bg-shm-gold",
  red: "bg-shm-red",
  purple: "bg-shm-lavender",
  navy: "bg-shm-navy-700",
};

export function StatCard({
  title,
  value,
  icon: Icon,
  accent = "navy",
  className,
  delta,
  hint,
  prefix,
  suffix,
  spark,
  animate = true,
  href,
  onClick,
  exceeded = false,
}: StatCardProps) {
  const numeric = typeof value === "number";
  const interactive = Boolean(href || onClick);

  const card = (
    <Card
      tone={exceeded ? "alert" : "reading"}
      className={cn(
        "group relative flex h-full flex-col p-5",
        interactive && "cursor-pointer",
        !interactive && className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "font-display text-[2.125rem] font-semibold leading-none tracking-[-0.02em] tabular-nums",
            exceeded ? "text-shm-red" : "text-shm-navy-900",
          )}
        >
          {numeric && animate ? (
            <CountUp value={value} prefix={prefix} suffix={suffix} />
          ) : (
            <>
              {prefix}
              {value}
              {suffix}
            </>
          )}
        </p>
        {Icon && (
          <Icon
            className="mt-1 h-4 w-4 shrink-0 text-slate-400"
            strokeWidth={1.75}
            aria-hidden
          />
        )}
      </div>

      <p className="mt-2 text-[0.875rem] leading-snug text-slate-700">{title}</p>

      {(delta || hint || spark) && (
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0">
            <span
              className={cn("mb-2 block h-px w-8", ACCENTS[accent] ?? ACCENTS.navy)}
              aria-hidden
            />
            {delta && (
              <p className="text-[0.78125rem] tabular-nums text-slate-600">
                {delta.startsWith("-") ? (
                  <span className="text-shm-red">{delta}</span>
                ) : (
                  delta
                )}
              </p>
            )}
            {hint && <p className="text-[0.78125rem] text-slate-500">{hint}</p>}
          </div>
          {spark && <Sparkline data={spark} className="h-6 w-20 shrink-0" />}
        </div>
      )}
    </Card>
  );

  const focus =
    "block rounded-lg focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-shm-navy-900 focus-visible:ring-offset-2";

  if (href) {
    return (
      <Link href={href} className={cn(focus, className)}>
        {card}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(focus, "w-full text-left", className)}>
        {card}
      </button>
    );
  }
  return card;
}
