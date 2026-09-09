import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,box-shadow,transform,color,border-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shm-navy-500 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
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
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };