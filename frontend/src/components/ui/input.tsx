"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /**
   * Suppresses the reveal control on a password field. Off by default — the
   * toggle is wanted almost everywhere someone types a password they cannot
   * see.
   */
  noReveal?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, noReveal, ...props }, ref) => {
    const [revealed, setRevealed] = React.useState(false);

    // Only password fields get the control, and the reveal is local state that
    // resets on unmount — nothing about it is persisted.
    const isPassword = type === "password";
    const showToggle = isPassword && !noReveal;
    const effectiveType = showToggle && revealed ? "text" : type;

    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-[13px] font-medium text-slate-700">{label}</label>
        )}
        <div className="relative">
          <input
            type={effectiveType}
            className={cn(
              "flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_2px_rgba(17,17,17,0.04)] transition-[border-color,box-shadow] duration-200",
              "placeholder:text-slate-400",
              "hover:border-slate-400",
              "focus-visible:border-shm-navy-500 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-shm-navy-500/15",
              "disabled:cursor-not-allowed disabled:opacity-50",
              // Room for the button, so a long password does not run underneath it.
              showToggle && "pr-10",
              error && "border-shm-red hover:border-shm-red focus-visible:border-shm-red focus-visible:ring-shm-red/15",
              className
            )}
            ref={ref}
            {...props}
          />
          {showToggle && (
            <button
              type="button"
              // type="button" is load-bearing: the default inside a <form> is
              // "submit", so without it revealing the password would submit the
              // sign-in form.
              onClick={() => setRevealed((v) => !v)}
              // Kept out of the tab order so it does not sit between the
              // password field and the submit button for keyboard users. It
              // stays reachable by pointer and by screen readers.
              tabIndex={-1}
              aria-label={revealed ? "Hide password" : "Show password"}
              aria-pressed={revealed}
              disabled={props.disabled}
              className={cn(
                "absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition-colors",
                "hover:text-slate-600 focus-visible:text-slate-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-shm-navy-500/15",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {revealed ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        {error && <p className="text-xs font-medium text-shm-red">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
