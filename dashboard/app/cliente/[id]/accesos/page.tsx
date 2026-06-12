"use client";

/**
 * /cliente/[id]/accesos — bóveda de credenciales del cliente.
 *
 * Estados: loading → (need-setup | need-setup-team | locked | unlocked | forbidden).
 * La passphrase de equipo se ingresa una vez por sesión (se guarda en
 * sessionStorage, se borra al cerrar la pestaña) y se reenvía en cada
 * crear/editar/revelar. Nunca se persiste en el server. Todas las fetch van
 * por cookie (same-origin); el endpoint valida acceso al cliente.
 */

import { use, useCallback, useEffect, useState } from "react";
import ui from "@/components/ClientUI.module.css";

interface Cred {
  id: string;
  label: string;
  category: string;
  username: string | null;
  url: string | null;
  hasNotes: boolean;
  addedByRole: "team" | "client";
  createdAt: string;
  updatedAt: string;
}

type Phase =
  | "loading"
  | "need-setup"
  | "need-setup-team"
  | "locked"
  | "unlocked"
  | "forbidden";

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

const PP_KEY = "vault_pp";

export default function AccesosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [phase, setPhase] = useState<Phase>("loading");
  const [passphrase, setPassphrase] = useState("");
  const [creds, setCreds] = useState<Cred[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // form (setup/unlock)
  const [pp1, setPp1] = useState("");
  const [pp2, setPp2] = useState("");
  const [busy, setBusy] = useState(false);

  // reveal state: credId → { secret, notes }
  const [revealed, setRevealed] = useState<Record<string, { secret: string; notes: string | null }>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // modal
  const [modal, setModal] = useState<{ open: boolean; editing: Cred | null }>({
    open: false,
    editing: null,
  });

  // ---- carga de estado de la bóveda ----
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/vault/unlock");
        if (res.status === 401 || res.status === 403) {
          setPhase("forbidden");
          return;
        }
        const data = await res.json();
        if (!data.setup) {
          setPhase(data.canSetup ? "need-setup" : "need-setup-team");
          return;
        }
        const saved =
          typeof window !== "undefined" ? sessionStorage.getItem(PP_KEY) : null;
        if (saved) {
          setPassphrase(saved);
          setPhase("unlocked");
        } else {
          setPhase("locked");
        }
      } catch {
        setErr("No se pudo cargar el estado de la bóveda.");
        setPhase("forbidden");
      }
    })();
  }, []);

  const loadCreds = useCallback(async () => {
    const res = await fetch(`/api/clients/${id}/credentials`);
    if (res.ok) {
      const d = await res.json();
      setCreds(d.credentials ?? []);
    }
  }, [id]);

  useEffect(() => {
    if (phase === "unlocked") loadCreds();
  }, [phase, loadCreds]);

  // ---- setup ----
  async function doSetup() {
    setErr(null);
    if (pp1.length < 8) return setErr("La passphrase debe tener al menos 8 caracteres.");
    if (pp1 !== pp2) return setErr("Las passphrases no coinciden.");
    setBusy(true);
    try {
      const res = await fetch("/api/vault/setup", {
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
      const res = await fetch("/api/vault/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pp1 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Passphrase incorrecta");
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
  async function fetchSecret(credId: string): Promise<{ secret: string; notes: string | null } | null> {
    const res = await fetch(`/api/clients/${id}/credentials/${credId}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (res.status === 401) {
      lock();
      setErr("La sesión de la bóveda expiró. Ingresá la passphrase de nuevo.");
      return null;
    }
    if (!res.ok) {
      setErr("No se pudo revelar la credencial.");
      return null;
    }
    return res.json();
  }

  async function toggleReveal(credId: string) {
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
    const res = await fetch(`/api/clients/${id}/credentials/${cred.id}`, {
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
  if (phase === "loading") {
    return (
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Accesos</div>
          <h1>Bóveda de credenciales</h1>
        </div>
      </div>
    );
  }

  if (phase === "forbidden") {
    return (
      <div className={ui.panel}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {err ?? "No tenés acceso a la bóveda de este cliente."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Accesos · cifrado</div>
          <h1>Bóveda de credenciales</h1>
        </div>
        {phase === "unlocked" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className={ui.btnGhost} onClick={lock} style={btnSm}>
              🔒 Bloquear
            </button>
            <button
              className={ui.btnGhost}
              onClick={() => setModal({ open: true, editing: null })}
              style={{ ...btnSm, background: "var(--deep-green)", color: "var(--off-white)" }}
            >
              + Nueva
            </button>
          </div>
        )}
      </div>

      {err && (
        <div style={errorBox}>{err}</div>
      )}

      {/* SETUP (director, primera vez) */}
      {phase === "need-setup" && (
        <div className={ui.panel} style={{ maxWidth: 460 }}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>Configurar la bóveda</div>
          </div>
          <p style={hint}>
            Definí la <strong>passphrase de equipo</strong>. Cifra todas las
            credenciales y <strong>no se guarda en ningún lado</strong> — si la
            perdés, no se recuperan. Guardala en un lugar seguro y compartila
            solo con quien deba acceder.
          </p>
          <input
            type="password"
            placeholder="Passphrase (mín. 8 caracteres)"
            value={pp1}
            onChange={(e) => setPp1(e.target.value)}
            style={input}
          />
          <input
            type="password"
            placeholder="Repetir passphrase"
            value={pp2}
            onChange={(e) => setPp2(e.target.value)}
            style={input}
          />
          <button onClick={doSetup} disabled={busy} style={btnPrimary}>
            {busy ? "Configurando…" : "Configurar bóveda"}
          </button>
        </div>
      )}

      {phase === "need-setup-team" && (
        <div className={ui.panel}>
          <p style={hint}>
            El director todavía no configuró la bóveda de credenciales. Pedile
            que la inicialice y te comparta la passphrase de equipo.
          </p>
        </div>
      )}

      {/* UNLOCK */}
      {phase === "locked" && (
        <div className={ui.panel} style={{ maxWidth: 460 }}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>🔒 Bóveda bloqueada</div>
          </div>
          <p style={hint}>
            Ingresá la passphrase de equipo para ver las credenciales.
          </p>
          <input
            type="password"
            placeholder="Passphrase"
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
          <div className={ui.panel}>
            <p style={hint}>
              Todavía no hay credenciales cargadas. Usá <strong>+ Nueva</strong>{" "}
              para agregar la primera.
            </p>
          </div>
        ) : (
          CATS.filter(([c]) => creds.some((cr) => cr.category === c)).map(([cat]) => (
            <div key={cat} className={ui.panel} style={{ marginBottom: 16 }}>
              <div className={ui.panelHead}>
                <div className={ui.panelTitle}>{catLabel(cat)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {creds
                  .filter((cr) => cr.category === cat)
                  .map((cr) => {
                    const rev = revealed[cr.id];
                    return (
                      <div key={cr.id} style={row}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={labelRow}>
                            {cr.label}
                            {cr.addedByRole === "client" && (
                              <span style={chip}>Cargada por el cliente</span>
                            )}
                          </div>
                          {cr.username && (
                            <div style={meta}>
                              <span style={{ fontFamily: "monospace" }}>{cr.username}</span>
                              <button
                                style={miniBtn}
                                onClick={() => copyText(cr.username!, `u-${cr.id}`)}
                              >
                                {copiedId === `u-${cr.id}` ? "✓" : "copiar"}
                              </button>
                            </div>
                          )}
                          {cr.url && (
                            <div style={meta}>
                              <a href={cr.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--sand-dark)" }}>
                                {cr.url}
                              </a>
                            </div>
                          )}
                          <div style={{ ...meta, marginTop: 4 }}>
                            <span style={{ fontFamily: "monospace", letterSpacing: rev ? 0 : 2 }}>
                              {rev ? rev.secret : "••••••••••"}
                            </span>
                          </div>
                          {rev?.notes && (
                            <div style={{ ...meta, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                              📝 {rev.notes}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button style={miniBtn} onClick={() => toggleReveal(cr.id)}>
                            {rev ? "ocultar" : "revelar"}
                          </button>
                          <button style={miniBtn} onClick={() => copySecret(cr.id)}>
                            {copiedId === cr.id ? "✓ copiado" : "copiar"}
                          </button>
                          <button style={miniBtn} onClick={() => setModal({ open: true, editing: cr })}>
                            editar
                          </button>
                          <button style={{ ...miniBtn, color: "#B91C1C" }} onClick={() => del(cr)}>
                            borrar
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))
        ))}

      {modal.open && (
        <CredModal
          clientId={id}
          passphrase={passphrase}
          editing={modal.editing}
          onClose={() => setModal({ open: false, editing: null })}
          onSaved={() => {
            setModal({ open: false, editing: null });
            loadCreds();
          }}
          onSessionExpired={() => {
            setModal({ open: false, editing: null });
            lock();
            setErr("La sesión de la bóveda expiró. Ingresá la passphrase de nuevo.");
          }}
        />
      )}
    </>
  );
}

// ============================================================
// Modal de alta / edición
// ============================================================
function CredModal({
  clientId,
  passphrase,
  editing,
  onClose,
  onSaved,
  onSessionExpired,
}: {
  clientId: string;
  passphrase: string;
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
      const payload: Record<string, unknown> = {
        label,
        category,
        username,
        url,
        passphrase,
      };
      if (secret) payload.secret = secret;
      if (notes) payload.notes = notes;

      const res = await fetch(
        editing
          ? `/api/clients/${clientId}/credentials/${editing.id}`
          : `/api/clients/${clientId}/credentials`,
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
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--deep-green)", marginBottom: 14 }}>
          {editing ? "Editar credencial" : "Nueva credencial"}
        </div>
        <input style={input} placeholder="Etiqueta (ej. WordPress admin)" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        <select style={input} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATS.map(([c, l]) => (
            <option key={c} value={c}>{l}</option>
          ))}
        </select>
        <input style={input} placeholder="Usuario / email (opcional)" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input style={input} placeholder="URL (opcional)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div style={{ position: "relative" }}>
          <input
            style={input}
            type={showSecret ? "text" : "password"}
            placeholder={editing ? "Contraseña (dejar vacío = sin cambios)" : "Contraseña"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button type="button" style={{ ...miniBtn, position: "absolute", right: 8, top: 10 }} onClick={() => setShowSecret((s) => !s)}>
            {showSecret ? "ocultar" : "ver"}
          </button>
        </div>
        <textarea
          style={{ ...input, minHeight: 60, resize: "vertical" }}
          placeholder={editing ? "Notas (dejar vacío = sin cambios)" : "Notas (opcional)"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {err && <div style={errorBox}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <button style={btnSm} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={save} disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- estilos inline ----
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginBottom: 10,
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
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
const meta: React.CSSProperties = {
  fontSize: 12,
  color: "var(--deep-green)",
  marginTop: 3,
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const labelRow: React.CSSProperties = {
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
