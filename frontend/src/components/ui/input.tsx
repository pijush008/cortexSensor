import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, ...props }, ref) => (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[13px] font-medium text-slate-700">{label}</label>
      )}
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(17,17,17,0.04)] transition-[border-color,box-shadow] duration-200",
          "placeholder:text-slate-400",
          "hover:border-slate-400",
          "focus-visible:border-shm-navy-500 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-shm-navy-500/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-shm-red hover:border-shm-red focus-visible:border-shm-red focus-visible:ring-shm-red/15",
          className
        )}
        ref={ref}
        {...props}
      />
      {error && <p className="text-xs font-medium text-shm-red">{error}</p>}
    </div>
  )
);
Input.displayName = "Input";

export { Input };