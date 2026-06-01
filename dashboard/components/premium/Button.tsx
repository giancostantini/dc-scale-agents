"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:shadow-ring-accent active:scale-[0.98] whitespace-nowrap select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-ink text-paper hover:bg-ink-800 shadow-premium-sm hover:shadow-premium",
        secondary:
          "bg-paper text-ink border border-rule-strong hover:bg-paper-200 hover:border-ink-300",
        ghost: "text-ink hover:bg-paper-200",
        accent:
          "bg-accent text-ink hover:bg-accent-dim shadow-premium-sm hover:shadow-premium",
        danger:
          "bg-paper text-danger border border-danger/20 hover:bg-danger/5 hover:border-danger/40",
        link: "text-ink underline-offset-4 hover:underline px-0 py-0",
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-premium-sm",
        sm: "h-8 px-3 text-xs rounded-premium-sm",
        md: "h-9 px-4 text-sm rounded-premium",
        lg: "h-11 px-6 text-md rounded-premium",
        icon: "h-9 w-9 rounded-premium",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="inline-block w-3 h-3 border-2 border-current border-r-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
