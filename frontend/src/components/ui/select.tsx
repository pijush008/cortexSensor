"use client";

import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  label?: string;
  error?: string;
}

export function Select({ options, label, error, className, ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        className={cn(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(17,17,17,0.04)] outline-none transition-[border-color,box-shadow] duration-200",
          "hover:border-slate-400",
          "focus:border-shm-navy-500 focus:ring-[3px] focus:ring-shm-navy-500/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-shm-red hover:border-shm-red focus:border-shm-red focus:ring-shm-red/15",
          className,
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs font-medium text-shm-red">{error}</p>}
    </div>
  );
}