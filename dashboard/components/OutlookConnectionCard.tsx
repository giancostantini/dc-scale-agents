"use client";

/**
 * OutlookConnectionCard — Card glass que muestra el estado de la
 * conexión Outlook del user actual + botones conectar/desconectar.
 *
 * Se monta tanto en:
 *  - /portal/calendario (cliente final, sincroniza su calendario al portal)
 *  - /calendario        (dashboard interno del equipo, sincroniza al
 *                        calendario interno)
 *
 * Estados:
 *  - not_connected: muestra CTA "Conectar Outlook"
 *  - connected:     muestra email + última sync + botón Desconectar
 *  - error:         muestra mensaje (último error de Microsoft) + Reintentar
 *
 * Flow:
 *  1. Click "Conectar" → GET /api/auth/outlook/start con Bearer → recibe URL
 *  2. window.location.href = url → Microsoft consent
 *  3. Microsoft → /api/auth/outlook/callback → guarda tokens → redirect
 *     al returnTo con ?outlook=connected
 *  4. Esta page detecta el query param y refresca el status.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./OutlookConnectionCard.module.css";

interface Status {
  connected: boolean;
  msEmail?: string;
  connectedAt?: string;
  lastSyncedAt?: string | null;
  subscriptionExpiresAt?: string | null;
  lastError?: string | null;
}

interface Props {
  /** Path al que volver después del OAuth (default: pathname actual). */
  returnTo?: string;
}

export default function OutlookConnectionCard({ returnTo }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setError(null);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/auth/outlook/status", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError("No pude leer el estado de conexión.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as Status;
      setStatus(data);
    } catch {
      setError("Error de red consultando el estado.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Detectar mensajes del callback (outlook=connected | outlook_error=...)
  useEffect(() => {
    const connected = searchParams?.get("outlook");
    const err = searchParams?.get("outlook_error");
    if (connected === "connected" || err) {
      // Limpiar los query params para que no queden pegados al historial
      const cleanParams = new URLSearchParams(searchParams.toString());
      cleanParams.delete("outlook");
      cleanParams.delete("outlook_error");
      const newUrl = cleanParams.toString()
        ? `?${cleanParams.toString()}`
        : window.location.pathname;
      router.replace(newUrl, { scroll: false });
      if (err) setError(err);
    }
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Tu sesión expiró. Refrescá la página.");
        setWorking(false);
        return;
      }
      const target = returnTo ?? window.location.pathname;
      const res = await fetch(
        `/api/auth/outlook/start?returnTo=${encodeURIComponent(target)}`,
        {
          headers: { authorization: `Bearer ${session.access_token}` },
        },
      );
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "No pude iniciar la conexión.");
        setWorking(false);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error de red.",
      );
      setWorking(false);
    }
  }, [returnTo]);

  const handleDisconnect = useCallback(async () => {
    if (!confirm("¿Desconectar tu Outlook? Los eventos ya sincronizados quedan visibles.")) {
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/auth/outlook/disconnect", {
        method: "POST",
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Falló la desconexión.");
        return;
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setWorking(false);
    }
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.skeleton} />
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className={styles.card}>
        <div className={styles.cardGlow} aria-hidden="true" />
        <div className={styles.header}>
          <div className={styles.icon} aria-hidden="true">
            <OutlookIcon />
          </div>
          <div>
            <div className={styles.eyebrow}>Sincronización · Outlook</div>
            <div className={styles.title}>Conectá tu calendario</div>
          </div>
        </div>
        <p className={styles.body}>
          Conectá tu cuenta de Outlook para que tus reuniones aparezcan
          acá automáticamente. Cuando crees, edites o canceles un evento
          en Outlook, este calendario se actualiza solo.
        </p>
        <button
          type="button"
          className={styles.connectBtn}
          onClick={handleConnect}
          disabled={working}
        >
          {working ? "Conectando…" : "Conectar Outlook"}
          {!working && (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          )}
        </button>
        {error && <p className={styles.errorMsg}>{error}</p>}
      </div>
    );
  }

  // ===== Connected =====
  return (
    <div className={styles.card}>
      <div className={styles.cardGlow} aria-hidden="true" />
      <div className={styles.header}>
        <div className={`${styles.icon} ${styles.iconConnected}`} aria-hidden="true">
          <OutlookIcon />
          <span className={styles.statusDot} />
        </div>
        <div className={styles.headerText}>
          <div className={styles.eyebrowConnected}>
            <span className={styles.greenDot} /> Conectado
          </div>
          <div className={styles.connectedEmail}>{status.msEmail}</div>
        </div>
        <button
          type="button"
          className={styles.disconnectBtn}
          onClick={handleDisconnect}
          disabled={working}
        >
          {working ? "…" : "Desconectar"}
        </button>
      </div>
      <div className={styles.meta}>
        {status.lastSyncedAt ? (
          <span className={styles.metaItem}>
            Última sync: {formatRelative(status.lastSyncedAt)}
          </span>
        ) : (
          <span className={styles.metaItem}>
            Esperando primera sincronización…
          </span>
        )}
        {status.lastError && (
          <span className={`${styles.metaItem} ${styles.metaError}`}>
            ⚠ {status.lastError}
          </span>
        )}
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `hace ${days}d`;
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

function OutlookIcon() {
  // Estilo "Outlook-ish" sin usar el logo oficial (evitar trademark issues)
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 9l10 6 10-6" />
      <path d="M2 6l10 6 10-6" opacity="0.4" />
    </svg>
  );
}
