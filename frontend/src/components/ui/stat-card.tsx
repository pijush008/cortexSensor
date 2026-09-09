"use client";

import { LucideIcon } from "lucide-react";
import { Card } from "./card";
import { CountUp } from "./count-up";
import { Sparkline } from "./sparkline";
import { cn } from "@/lib/utils";

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
}

const ACCENTS = {
  green: { bar: "bg-shm-green", text: "text-shm-green-text", dot: "bg-shm-green" },
  blue: { bar: "bg-shm-navy-500", text: "text-shm-navy-600", dot: "bg-shm-navy-500" },
  yellow: { bar: "bg-shm-yellow", text: "text-shm-yellow", dot: "bg-shm-yellow" },
  red: { bar: "bg-shm-red", text: "text-shm-red", dot: "bg-shm-red" },
  purple: { bar: "bg-purple-500", text: "text-purple-600", dot: "bg-purple-500" },
  navy: { bar: "bg-shm-navy-700", text: "text-shm-navy-700", dot: "bg-shm-navy-700" },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  accent = "green",
  className,
  delta,
  hint,
  prefix,
  suffix,
  spark,
  animate = true,
}: StatCardProps) {
  const a = ACCENTS[accent] ?? ACCENTS.green;
  const numeric = typeof value === "number";

  return (
    <Card className={cn("group relative overflow-hidden p-5", className)}>
      {/* accent rule */}
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100",
          a.bar
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] text-slate-500">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
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
        </div>
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors duration-300 group-hover:bg-shm-navy-50 group-hover:text-shm-navy-600">
            <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
          </span>
        )}
      </div>

      {(delta || hint || spark) && (
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0">
            {delta && (
              <p className="text-xs font-medium" aria-live="polite">
                {delta.startsWith("-") || delta.startsWith("+") ? (
                  <span className={delta.startsWith("-") ? "text-shm-red" : "text-shm-green-text"}>
                    {delta}
                  </span>
                ) : (
                  <span className="text-slate-600">{delta}</span>
                )}
              </p>
            )}
            {hint && <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p>}
          </div>
          {spark && <Sparkline data={spark} className="h-6 w-20 shrink-0" />}
        </div>
      )}
    </Card>
  );
}