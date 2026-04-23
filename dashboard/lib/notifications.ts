"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase/client";
import type { Notification } from "./types";

interface UseNotificationsOptions {
  clientId?: string;
  limit?: number;
  /** Called when a new notification arrives via realtime. */
  onNew?: (n: Notification) => void;
}

/**
 * Subscribes to the `notifications` table via Supabase Realtime and keeps a
 * rolling list of recent notifications. If `clientId` is provided, filters to
 * that client; otherwise returns cross-client notifications (hub view).
 */
export function useNotifications({ clientId, limit = 30, onNew }: UseNotificationsOptions = {}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    const load = () => {
      let q = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (clientId) q = q.eq("client", clientId);
      q.then(({ data }) => {
        if (cancelled) return;
        setItems((data ?? []) as Notification[]);
        setLoading(false);
      });
    };

    load();

    const channel = supabase
      .channel(`notifications-${clientId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          ...(clientId ? { filter: `client=eq.${clientId}` } : {}),
        },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev].slice(0, limit));
          onNew?.(n);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          ...(clientId ? { filter: `client=eq.${clientId}` } : {}),
        },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [clientId, limit, onNew]);

  const unread = items.filter((n) => !n.read).length;

  return { items, unread, loading };
}

export async function markAsRead(id: number): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("notifications").update({ read: true }).eq("id", id);
}

export async function markAllAsRead(clientId?: string): Promise<void> {
  const supabase = getSupabase();
  let q = supabase.from("notifications").update({ read: true }).eq("read", false);
  if (clientId) q = q.eq("client", clientId);
  await q;
}
