"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Form inputs premium — texto, number, select, textarea, date.
 * Estética Mercury: bordes sutiles, padding generoso, focus con ring.
 */

const inputBaseClasses =
  "w-full px-3 h-9 text-sm bg-paper border border-rule rounded-premium-sm placeholder-ink-300 text-ink focus:outline-none focus:border-ink-400 focus:shadow-ring-ink transition-all";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(inputBaseClasses, className)}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full px-3 py-2 text-sm bg-paper border border-rule rounded-premium-sm placeholder-ink-300 text-ink focus:outline-none focus:border-ink-400 focus:shadow-ring-ink transition-all resize-y min-h-[80px]",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      inputBaseClasses,
      "appearance-none bg-no-repeat bg-right pr-9 cursor-pointer",
      className,
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237A8A7E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
      backgroundPosition: "right 0.6rem center",
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-2xs uppercase tracking-[0.12em] font-semibold text-ink-400"
      >
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-300">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
