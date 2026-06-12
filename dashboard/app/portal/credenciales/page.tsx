"use client";

/**
 * /portal/credenciales — bóveda de credenciales del CLIENTE.
 *
 * El cliente define SU frase clave (igual que el equipo la suya), deposita sus
 * contraseñas y las re-ve cuando quiera. Lo que carga acá aparece solo en la
 * vista interna del equipo (mismo cliente). Cifrado de sobre: ni el servidor ni
 * D&C pueden leer sin la frase clave del cliente (el equipo lee con la suya).
 *
 * Estados: loading → (need-setup | locked | unlocked). La frase clave vive en
 * sessionStorage (se borra al cerrar la pestaña) y se reenvía al revelar. Todas
 * las fetch van con Bearer token (patrón del portal).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
} from "@/lib/supabase/auth";
import { getClient } from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import PortalHeader from "@/components/PortalHeader";
import type { Client } from "@/lib/types";
import styles from "../portal.module.css";

interface Cred {
  id: string;
  label: string;
  category: string;
  username: string | null;
  url: string | null;
  hasNotes: boolean;
  addedByRole: "team" | "client";
  clientReadable: boolean;
  createdAt: string;
  updatedAt: string;
}

type Phase = "loading" | "need-setup" | "locked" | "unlocked";

const CATS: Array<[string, string]> = [
  ["cms", "CMS / Web"],
  ["hosting", "Hosting"],
  ["email", "Email"],
  ["social", "Redes"],
  ["analytics", "Analytics"],
  ["dominio", "Dominio"],
  ["otro", "Otro"],
];
const catLabel = (c: string) => CATS.find((x) => x[0] === c)?.[1] ?? c;

const PP_KEY = "portal_vault_pp";

async function authedFetch(input: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return fetch(input, { ...init, headers });
}

export default function PortalCredencialesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [teamReady, setTeamReady] = useState(true);

  const [phase, setPhase] = useState<Phase>("loading");
  const [passphrase, setPassphrase] = useState("");
  const [creds, setCreds] = useState<Cred[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [pp1, setPp1] = useState("");
  const [pp2, setPp2] = useState("");
  const [busy, setBusy] = useState(false);

  const [revealed, setRevealed] = useState<
    Record<string, { secret: string; notes: string | null }>
  >({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [modal, setModal] = useState<{ open: boolean; editing: Cred | null }>({
    open: false,
    editing: null,
  });

  // ---- bootstrap: sesión, perfil, cliente, estado de la bóveda ----
  useEffect(() => {
    (async () => {
      const has = await hasSession();
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!p) {
        router.replace("/");
        return;
      }
      if (p.role !== "client") {
        router.replace("/hub");
        return;
      }
      setProfile(p);
      if (p.client_id) {
        const c = await getClient(p.client_id);
        setClient(c ?? null);
      }

      try {
        const res = await authedFetch("/api/portal/vault");
        if (!res.ok) {
          setErr("No se pudo cargar el estado de tu bóveda.");
          setPhase("need-setup");
          return;
        }
        const data = await res.json();
        setTeamReady(data.teamReady !== false);
        if (!data.setup) {
          setPhase("need-setup");
          return;
        }
        const saved =
          typeof window !== "undefined"
            ? sessionStorage.getItem(PP_KEY)
            : null;
        if (saved) {
          setPassphrase(saved);
          setPhase("unlocked");
        } else {
          setPhase("locked");
        }
      } catch {
        setErr("No se pudo cargar el estado de tu bóveda.");
        setPhase("need-setup");
      }
    })();
  }, [router]);

  const loadCreds = useCallback(async () => {
    const res = await authedFetch("/api/portal/credentials");
    if (res.ok) {
      const d = await res.json();
      setCreds(d.credentials ?? []);
    }
  }, []);

  useEffect(() => {
    if (phase === "unlocked") loadCreds();
  }, [phase, loadCreds]);

  // ---- setup ----
  async function doSetup() {
    setErr(null);
    if (pp1.length < 8)
      return setErr("La frase clave debe tener al menos 8 caracteres.");
    if (pp1 !== pp2) return setErr("Las frases clave no coinciden.");
    setBusy(true);
    try {
      const res = await authedFetch("/api/portal/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pp1 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Error");
      sessionStorage.setItem(PP_KEY, pp1);
      setPassphrase(pp1);
      setPp1("");
      setPp2("");
      setPhase("unlocked");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---- unlock ----
  async function doUnlock() {
    setErr(null);
    setBusy(true);
    try {
      const res = await authedFetch("/api/portal/vault/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pp1 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Frase clave incorrecta");
      sessionStorage.setItem(PP_KEY, pp1);
      setPassphrase(pp1);
      setPp1("");
      setPhase("unlocked");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function lock() {
    sessionStorage.removeItem(PP_KEY);
    setPassphrase("");
    setRevealed({});
    setPhase("locked");
  }

  // ---- reveal / copy ----
  async function fetchSecret(
    credId: string,
  ): Promise<{ secret: string; notes: string | null } | null> {
    const res = await authedFetch(
      `/api/portal/credentials/${credId}/reveal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      },
    );
    if (res.status === 401) {
      lock();
      setErr("La sesión de tu bóveda expiró. Ingresá la frase clave de nuevo.");
      return null;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? "No se pudo revelar la credencial.");
      return null;
    }
    return res.json();
  }

  async function toggleReveal(credId: string) {
    setErr(null);
    if (revealed[credId]) {
      setRevealed((r) => {
        const n = { ...r };
        delete n[credId];
        return n;
      });
      return;
    }
    const s = await fetchSecret(credId);
    if (s) setRevealed((r) => ({ ...r, [credId]: s }));
  }

  async function copySecret(credId: string) {
    const s = revealed[credId] ?? (await fetchSecret(credId));
    if (!s) return;
    await navigator.clipboard.writeText(s.secret);
    setCopiedId(credId);
    setTimeout(() => setCopiedId((c) => (c === credId ? null : c)), 1800);
  }

  async function copyText(text: string, marker: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(marker);
    setTimeout(() => setCopiedId((c) => (c === marker ? null : c)), 1800);
  }

  async function del(cred: Cred) {
    if (!confirm(`¿Borrar "${cred.label}"? No se puede deshacer.`)) return;
    const res = await authedFetch(`/api/portal/credentials/${cred.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setRevealed((r) => {
        const n = { ...r };
        delete n[cred.id];
        return n;
      });
      loadCreds();
    } else {
      setErr("No se pudo borrar.");
    }
  }

  // ---- render ----
  if (phase === "loading" || !profile) return null;

  return (
    <>
      <PortalHeader
        client={client}
        profile={profile}
        eyebrow={`Credenciales · ${client?.name ?? "Tu empresa"}`}
        showBack
      />

      <main className={styles.main}>
        <section className={styles.heroBlock}>
          <div className={styles.heroLeft}>
            <div className={styles.heroEyebrow}>Bóveda · cifrada de punta a punta</div>
            <h1 className={styles.heroTitle}>Tus accesos y credenciales</h1>
            <div className={styles.heroSub}>
              Guardá tus contraseñas acá en vez de pasarlas por WhatsApp. Quedan
              cifradas con tu frase clave; el equipo de D&C las usa para
              trabajar, pero nadie más puede leerlas.
            </div>
          </div>
          {phase === "unlocked" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnSm} onClick={lock}>
                🔒 Bloquear
              </button>
              <button
                style={{ ...btnSm, ...btnSolid }}
                onClick={() => setModal({ open: true, editing: null })}
              >
                + Nueva
              </button>
            </div>
          )}
        </section>

        {err && <div style={errorBox}>{err}</div>}

        {/* SETUP (primera vez) */}
        {phase === "need-setup" && (
          <div style={panel}>
            <div style={panelTitle}>Creá tu frase clave</div>
            <p style={hint}>
              Es la llave de tu bóveda. Cifra todas tus credenciales y{" "}
              <strong>no se guarda en ningún lado</strong> — si la perdés, no se
              pueden recuperar (vas a poder armar una nueva). Guardala en un
              lugar seguro.
            </p>
            {!teamReady && (
              <p style={{ ...hint, color: "var(--yellow-warn, #92600A)" }}>
                Nota: el equipo todavía está terminando de habilitar la bóveda
                compartida. Podés crear tu frase clave igual; si al guardar una
                credencial te da un aviso, escribinos.
              </p>
            )}
            <input
              type="password"
              placeholder="Frase clave (mín. 8 caracteres)"
              value={pp1}
              onChange={(e) => setPp1(e.target.value)}
              style={input}
            />
            <input
              type="password"
              placeholder="Repetir frase clave"
              value={pp2}
              onChange={(e) => setPp2(e.target.value)}
              style={input}
            />
            <button onClick={doSetup} disabled={busy} style={btnPrimary}>
              {busy ? "Creando…" : "Crear mi bóveda"}
            </button>
          </div>
        )}

        {/* UNLOCK */}
        {phase === "locked" && (
          <div style={panel}>
            <div style={panelTitle}>🔒 Bóveda bloqueada</div>
            <p style={hint}>Ingresá tu frase clave para ver tus credenciales.</p>
            <input
              type="password"
              placeholder="Frase clave"
              value={pp1}
              onChange={(e) => setPp1(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doUnlock()}
              style={input}
              autoFocus
            />
            <button onClick={doUnlock} disabled={busy} style={btnPrimary}>
              {busy ? "Abriendo…" : "Desbloquear"}
            </button>
          </div>
        )}

        {/* LISTA */}
        {phase === "unlocked" &&
          (creds.length === 0 ? (
            <div style={panel}>
              <p style={hint}>
                Todavía no cargaste credenciales. Tocá <strong>+ Nueva</strong>{" "}
                para guardar la primera (ej. el acceso a tu web, redes, hosting).
              </p>
            </div>
          ) : (
            CATS.filter(([c]) => creds.some((cr) => cr.category === c)).map(
              ([cat]) => (
                <div key={cat} style={{ ...panel, marginBottom: 16 }}>
                  <div style={panelTitle}>{catLabel(cat)}</div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 10 }}
                  >
                    {creds
                      .filter((cr) => cr.category === cat)
                      .map((cr) => {
                        const rev = revealed[cr.id];
                        const mine = cr.addedByRole === "client";
                        return (
                          <div key={cr.id} style={row}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={rowLabel}>
                                {cr.label}
                                {!mine && (
                                  <span style={chip}>Cargada por el equipo</span>
                                )}
                              </div>
                              {cr.username && (
                                <div style={meta}>
                                  <span style={{ fontFamily: "monospace" }}>
                                    {cr.username}
                                  </span>
                                  <button
                                    style={miniBtn}
                                    onClick={() =>
                                      copyText(cr.username!, `u-${cr.id}`)
                                    }
                                  >
                                    {copiedId === `u-${cr.id}` ? "✓" : "copiar"}
                                  </button>
                                </div>
                              )}
                              {cr.url && (
                                <div style={meta}>
                                  <a
                                    href={cr.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "var(--sand-dark)" }}
                                  >
                                    {cr.url}
                                  </a>
                                </div>
                              )}
                              <div style={{ ...meta, marginTop: 4 }}>
                                <span
                                  style={{
                                    fontFamily: "monospace",
                                    letterSpacing: rev ? 0 : 2,
                                  }}
                                >
                                  {rev ? rev.secret : "••••••••••"}
                                </span>
                              </div>
                              {rev?.notes && (
                                <div
                                  style={{
                                    ...meta,
                                    color: "var(--text-muted)",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  📝 {rev.notes}
                                </div>
                              )}
                            </div>
                            <div
                              style={{ display: "flex", gap: 6, flexShrink: 0 }}
                            >
                              {cr.clientReadable ? (
                                <>
                                  <button
                                    style={miniBtn}
                                    onClick={() => toggleReveal(cr.id)}
                                  >
                                    {rev ? "ocultar" : "revelar"}
                                  </button>
                                  <button
                                    style={miniBtn}
                                    onClick={() => copySecret(cr.id)}
                                  >
                                    {copiedId === cr.id ? "✓ copiado" : "copiar"}
                                  </button>
                                </>
                              ) : (
                                <span style={{ ...meta, marginTop: 0 }}>—</span>
                              )}
                              {mine && (
                                <>
                                  <button
                                    style={miniBtn}
                                    onClick={() =>
                                      setModal({ open: true, editing: cr })
                                    }
                                  >
                                    editar
                                  </button>
                                  <button
                                    style={{ ...miniBtn, color: "#B91C1C" }}
                                    onClick={() => del(cr)}
                                  >
                                    borrar
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ),
            )
          ))}

        {modal.open && (
          <CredModal
            editing={modal.editing}
            onClose={() => setModal({ open: false, editing: null })}
            onSaved={() => {
              setModal({ open: false, editing: null });
              loadCreds();
            }}
            onSessionExpired={() => {
              setModal({ open: false, editing: null });
              lock();
              setErr(
                "La sesión de tu bóveda expiró. Ingresá la frase clave de nuevo.",
              );
            }}
          />
        )}
      </main>
    </>
  );
}

// ============================================================
// Modal de alta / edición (credenciales del propio cliente)
// ============================================================
function CredModal({
  editing,
  onClose,
  onSaved,
  onSessionExpired,
}: {
  editing: Cred | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionExpired: () => void;
}) {
  const [label, setLabel] = useState(editing?.label ?? "");
  const [category, setCategory] = useState(editing?.category ?? "otro");
  const [username, setUsername] = useState(editing?.username ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [secret, setSecret] = useState("");
  const [notes, setNotes] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!label.trim()) return setErr("Falta la etiqueta.");
    if (!editing && !secret) return setErr("Falta la contraseña.");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { label, category, username, url };
      if (secret) payload.secret = secret;
      if (notes) payload.notes = notes;

      const res = await authedFetch(
        editing
          ? `/api/portal/credentials/${editing.id}`
          : `/api/portal/credentials`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Error guardando");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={modalTitle}>
          {editing ? "Editar credencial" : "Nueva credencial"}
        </div>
        <input
          style={input}
          placeholder="Etiqueta (ej. Instagram, WordPress admin)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
        <select
          style={input}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATS.map(([c, l]) => (
            <option key={c} value={c}>
              {l}
            </option>
          ))}
        </select>
        <input
          style={input}
          placeholder="Usuario / email (opcional)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          style={input}
          placeholder="URL (opcional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div style={{ position: "relative" }}>
          <input
            style={input}
            type={showSecret ? "text" : "password"}
            placeholder={
              editing ? "Contraseña (dejar vacío = sin cambios)" : "Contraseña"
            }
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button
            type="button"
            style={{ ...miniBtn, position: "absolute", right: 8, top: 10 }}
            onClick={() => setShowSecret((s) => !s)}
          >
            {showSecret ? "ocultar" : "ver"}
          </button>
        </div>
        <textarea
          style={{ ...input, minHeight: 60, resize: "vertical" }}
          placeholder={
            editing ? "Notas (dejar vacío = sin cambios)" : "Notas (opcional)"
          }
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {err && <div style={errorBox}>{err}</div>}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 6,
          }}
        >
          <button style={btnSm} onClick={onClose}>
            Cancelar
          </button>
          <button style={btnPrimary} onClick={save} disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- estilos inline ----
const panel: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid rgba(10,26,12,0.08)",
  borderRadius: 12,
  padding: 20,
  maxWidth: 620,
};
const panelTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--deep-green)",
  marginBottom: 10,
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginBottom: 10,
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 18px",
  background: "var(--deep-green)",
  color: "var(--off-white)",
  border: "none",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
const btnSm: React.CSSProperties = {
  padding: "7px 13px",
  fontSize: 12,
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
  border: "1px solid rgba(10,26,12,0.15)",
  background: "var(--off-white)",
  color: "var(--deep-green)",
};
const btnSolid: React.CSSProperties = {
  background: "var(--deep-green)",
  color: "var(--off-white)",
  border: "none",
};
const miniBtn: React.CSSProperties = {
  padding: "3px 9px",
  fontSize: 11,
  background: "var(--off-white)",
  border: "1px solid rgba(10,26,12,0.12)",
  borderRadius: 5,
  cursor: "pointer",
  fontFamily: "inherit",
  color: "var(--deep-green)",
};
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  padding: "12px 14px",
  background: "var(--off-white)",
  border: "1px solid rgba(10,26,12,0.08)",
  borderRadius: 8,
};
const rowLabel: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  color: "var(--deep-green)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};
const chip: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: "var(--sand-dark)",
  background: "rgba(196,168,130,0.16)",
  border: "1px solid rgba(196,168,130,0.4)",
  borderRadius: 999,
  padding: "1px 8px",
};
const meta: React.CSSProperties = {
  fontSize: 12,
  color: "var(--deep-green)",
  marginTop: 3,
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const hint: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  lineHeight: 1.55,
  marginBottom: 14,
};
const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(176,75,58,0.08)",
  border: "1px solid rgba(176,75,58,0.25)",
  borderRadius: 6,
  fontSize: 12.5,
  color: "#B91C1C",
  marginBottom: 14,
  maxWidth: 620,
};
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10,26,12,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};
const modalBox: React.CSSProperties = {
  background: "var(--white)",
  borderRadius: 12,
  padding: 24,
  width: "100%",
  maxWidth: 440,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};
const modalTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "var(--deep-green)",
  marginBottom: 14,
};
