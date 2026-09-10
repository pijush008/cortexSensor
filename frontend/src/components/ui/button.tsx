import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium cursor-pointer",
    "transition-[background-color,box-shadow,transform,color,border-color] duration-200 ease-out",
    // Keyboard focus must be at least as visible as hover, never less.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sheet-rust focus-visible:ring-offset-2",
    // Lift on hover, press below the resting line on click: the pair is what
    // makes a button feel like a physical control rather than a colour swap.
    "hover:-translate-y-px active:translate-y-[1px] active:scale-[0.985]",
    "motion-reduce:transform-none motion-reduce:transition-none",
    "disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-shm-navy-800 text-white shadow-[0_2px_8px_-2px_rgba(17,17,17,0.4)] hover:bg-shm-navy-700 hover:shadow-[0_6px_16px_-6px_rgba(17,17,17,0.5)]",
        destructive:
          "bg-shm-red text-white shadow-[0_2px_8px_-2px_rgba(204,28,22,0.4)] hover:bg-red-600",
        outline:
          "border border-slate-300 bg-white text-slate-700 hover:border-shm-navy-400 hover:bg-slate-50 hover:text-slate-900",
        secondary:
          "bg-slate-100 text-slate-800 hover:bg-slate-200",
        ghost:
          "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
        link:
          "text-shm-navy-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Shows a spinner and blocks further clicks while an action is in flight.
   *
   * The label stays in place and keeps its width — swapping it for "Loading…"
   * makes the button resize under the cursor, and hiding it loses the one piece
   * of information that says what is currently happening.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      disabled={disabled || loading}
      // Announced to assistive technology, which cannot see the spinner.
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <Loader2
          className="mo-spin h-4 w-4 shrink-0"
          aria-hidden="true"
          strokeWidth={2.25}
        />
      )}
      {children}
    </button>
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };