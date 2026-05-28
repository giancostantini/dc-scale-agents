"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Toast notifications con sonner, themed para D&C.
 * Uso: import { toast } from "sonner"; toast.success("..."); toast.error("...");
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      theme="light"
      toastOptions={{
        style: {
          background: "#0A1A0C",
          color: "#FFFFFF",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "10px",
          fontSize: "13px",
          fontFamily: "Inter, -apple-system, sans-serif",
          boxShadow:
            "0 16px 48px -8px rgba(10, 26, 12, 0.30)",
        },
        className: "font-medium",
      }}
    />
  );
}
