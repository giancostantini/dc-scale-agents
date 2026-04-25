"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase/client";
import type { AgentRun } from "./types";

interface UseAgentRunsOptions {
  /** Si se pasa, filtra runs a ese cliente. Si no, devuelve cross-client. */
  clientId?: string;
  /** Cantidad máxima de runs en memoria. Default 30. */
  limit?: number;
  /**
   * Callback cuando llega un INSERT (run nuevo). Útil para toasts.
   */
  onNew?: (r: AgentRun) => void;
  /**
   * Callback cuando un run cambia de status (UPDATE). Útil para refrescar
   * cuando running → success.
   */
  onUpdate?: (r: AgentRun) => void;
}

/**
 * Suscribe a `agent_runs` via Supabase Realtime y mantiene una lista rolling
 * de los runs más recientes. Reemplaza el polling de 15-20s con updates
 * push instantáneos (latencia <500ms).
 *
 * Pre-requisito: la tabla `agent_runs` tiene que estar en la publicación
 * `supabase_realtime`. Correr una vez:
 *   alter publication supabase_realtime add table agent_runs;
 *
 * Si Realtime falla (pre-req no corrido, conexión caída), el initial fetch
 * sigue funcionando — el usuario ve la lista al cargar pero no recibe
 * updates en vivo. La función `refresh()` permite forzar un re-fetch
 * manual como fallback.
 */
export function useAgentRuns({
  clientId,
  limit = 30,
  onNew,
  onUpdate,
}: UseAgentRunsOptions = {}) {
  const [items, setItems] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    const load = async () => {
      let q = supabase
        .from("agent_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (clientId) q = q.eq("client", clientId);
      const { data } = await q;
      if (cancelled) return;
      setItems((data ?? []) as AgentRun[]);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`agent_runs-${clientId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_runs",
          ...(clientId ? { filter: `client=eq.${clientId}` } : {}),
        },
        (payload) => {
          const r = payload.new as AgentRun;
          setItems((prev) => [r, ...prev].slice(0, limit));
          onNew?.(r);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_runs",
          ...(clientId ? { filter: `client=eq.${clientId}` } : {}),
        },
        (payload) => {
          const r = payload.new as AgentRun;
          setItems((prev) => {
            const idx = prev.findIndex((x) => x.id === r.id);
            if (idx === -1) return [r, ...prev].slice(0, limit);
            const next = prev.slice();
            next[idx] = r;
            return next;
          });
          onUpdate?.(r);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [clientId, limit, onNew, onUpdate]);

  const refresh = async () => {
    const supabase = getSupabase();
    let q = supabase
      .from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (clientId) q = q.eq("client", clientId);
    const { data } = await q;
    setItems((data ?? []) as AgentRun[]);
  };

  return { items, loading, refresh };
}
