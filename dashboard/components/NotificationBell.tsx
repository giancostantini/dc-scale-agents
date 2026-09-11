"use client";

import { useState } from "react";
import { useNotifications } from "@/lib/notifications";
import NotificationDrawer from "./NotificationDrawer";
import NotificationToast from "./NotificationToast";
import { IBell } from "./icons/BrandIcons";
import type { Notification } from "@/lib/types";
import styles from "./Topbar.module.css";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);

  const { items, unread } = useNotifications({
    limit: 40,
    onNew: (n) => setToast(n),
  });

  return (
    <>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => setOpen(true)}
        title="Alertas"
        aria-label={unread > 0 ? `Alertas (${unread} sin leer)` : "Alertas"}
      >
        <IBell size={19} />
        {unread > 0 && (
          <span className={styles.iconBadge}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      <NotificationDrawer
        open={open}
        onClose={() => setOpen(false)}
        items={items}
      />

      <NotificationToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
