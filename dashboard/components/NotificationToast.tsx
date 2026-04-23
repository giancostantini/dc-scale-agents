"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Notification, NotificationLevel } from "@/lib/types";

interface NotificationToastProps {
  toast: Notification | null;
  onDismiss: () => void;
  durationMs?: number;
}

const LEVEL_COLORS: Record<NotificationLevel, string> = {
  info: "var(--sand-dark)",
  success: "var(--green-ok)",
  warning: "var(--yellow-warn)",
  error: "var(--red-warn)",
};

export default function NotificationToast({
  toast,
  onDismiss,
  durationMs = 5000,
}: NotificationToastProps) {
  const router = useRouter();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [toast, durationMs, onDismiss]);

  if (!toast) return null;

  function handleClick() {
    if (toast?.link) {
      router.push(toast.link);
      onDismiss();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 80,
        right: 24,
        width: "min(360px, 90vw)",
        background: "var(--white)",
        borderLeft: `3px solid ${LEVEL_COLORS[toast.level]}`,
        boxShadow: "0 12px 32px rgba(10,26,12,0.18)",
        zIndex: 250,
        padding: "14px 18px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
        animation: "toastIn 0.25s ease-out",
      }}
    >
      <div
        onClick={handleClick}
        style={{ cursor: toast.link ? "pointer" : "default", minWidth: 0 }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: LEVEL_COLORS[toast.level],
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          {toast.level} · {toast.client}
          {toast.agent ? ` · ${toast.agent}` : ""}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--deep-green)",
            marginBottom: toast.body ? 4 : 0,
          }}
        >
          {toast.title}
        </div>
        {toast.body && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1.4,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {toast.body}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          fontSize: 16,
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: 2,
          lineHeight: 1,
          alignSelf: "start",
        }}
        aria-label="Cerrar"
      >
        ×
      </button>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
