"use client";

import { useRouter } from "next/navigation";
import { markAllAsRead, markAsRead } from "@/lib/notifications";
import type { Notification, NotificationLevel } from "@/lib/types";

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  items: Notification[];
}

const LEVEL_COLORS: Record<NotificationLevel, string> = {
  info: "var(--sand-dark)",
  success: "var(--green-ok)",
  warning: "var(--yellow-warn)",
  error: "var(--red-warn)",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} d`;
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
}

export default function NotificationDrawer({ open, onClose, items }: NotificationDrawerProps) {
  const router = useRouter();

  if (!open) return null;

  const unreadCount = items.filter((n) => !n.read).length;

  async function handleClick(n: Notification) {
    if (!n.read) {
      void markAsRead(n.id);
    }
    if (n.link) {
      router.push(n.link);
      onClose();
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 26, 12, 0.35)",
        zIndex: 150,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 90vw)",
          height: "100%",
          background: "var(--white)",
          boxShadow: "-4px 0 24px rgba(10,26,12,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid rgba(10,26,12,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Notificaciones
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--deep-green)" }}>
              {unreadCount > 0 ? `${unreadCount} sin leer` : "Todas leídas"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                style={{
                  padding: "6px 10px",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  background: "transparent",
                  color: "var(--sand-dark)",
                  border: "1px solid rgba(10,26,12,0.15)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Marcar todo
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 20,
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 4,
                lineHeight: 1,
              }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {items.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              Todavía no hay notificaciones.
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "8px 1fr auto",
                  gap: 14,
                  padding: "14px 22px",
                  borderBottom: "1px solid rgba(10,26,12,0.05)",
                  background: n.read ? "transparent" : "rgba(196,168,130,0.06)",
                  textAlign: "left",
                  border: "none",
                  borderLeft: `3px solid ${n.read ? "transparent" : LEVEL_COLORS[n.level]}`,
                  cursor: n.link ? "pointer" : "default",
                  fontFamily: "inherit",
                  color: "inherit",
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: n.read ? "transparent" : LEVEL_COLORS[n.level],
                    marginTop: 4,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: n.read ? 500 : 600,
                      color: "var(--deep-green)",
                      marginBottom: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {n.title}
                  </div>
                  {n.body && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        lineHeight: 1.5,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {n.body}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--sand-dark)",
                      marginTop: 6,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {n.client}
                    {n.agent ? ` · ${n.agent}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--sand-dark)", whiteSpace: "nowrap" }}>
                  {formatTime(n.created_at)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
