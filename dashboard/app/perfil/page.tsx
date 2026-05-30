"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import {
  getCurrentProfile,
  hasSession,
  signOut,
  type Profile,
  type ClientAssignment,
} from "@/lib/supabase/auth";
import {
  listAssignmentsForUser,
  updateProfile,
  makeInitialsFromName,
} from "@/lib/team";
import { getClients } from "@/lib/storage";
import { getSupabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";
import styles from "./perfil.module.css";

interface OutlookStatus {
  connected: boolean;
  email?: string | null;
  connected_at?: string | null;
}

export default function PerfilPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [clientsById, setClientsById] = useState<Record<string, Client>>({});

  // Edit local fields (name + phone)
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      setAuthChecked(true);
      const p = await getCurrentProfile();
      setProfile(p);
      if (p) {
        setEditName(p.name);
        setEditPhone(p.phone ?? "");
        const [asg, clis] = await Promise.all([
          listAssignmentsForUser(p.id),
          getClients(),
        ]);
        setAssignments(asg);
        setClientsById(
          Object.fromEntries(clis.map((c) => [c.id, c])) as Record<
            string,
            Client
          >,
        );
      }
    });
  }, [router]);

  if (!authChecked || !profile) return null;

  async function saveSelfEdits() {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await updateProfile(profile.id, {
        name: editName.trim() || profile.name,
        phone: editPhone.trim() || null,
        initials: makeInitialsFromName(editName.trim() || profile.name),
      });
      if (updated) setProfile(updated);
      setEditing(false);
    } catch (err) {
      console.error("update profile error:", err);
      alert("No se pudo guardar. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  const isDirector = profile.role === "director";
  const isClient = profile.role === "client";
  // Pago: sólo se muestra si hay valor (datos sensibles).
  const hasPayment = profile.payment_amount != null;

  return (
    <>
      <Topbar showPrimary={false} />

      <main className={styles.wrap}>
        <div className={styles.head}>
          <div>
            <div className={styles.eyebrow}>Mi perfil</div>
            <h1>{profile.name}</h1>
            <div className={styles.email}>{profile.email}</div>
          </div>
          <div className={styles.actions}>
            {isDirector && (
              <Link href="/equipo" className={styles.btnGhost}>
                Gestionar equipo →
              </Link>
            )}
            <button onClick={handleSignOut} className={styles.btnGhost}>
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* ===== Identidad + Rol ===== */}
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>Identidad y rol</div>
            {!editing && (
              <button
                className={styles.linkBtn}
                onClick={() => setEditing(true)}
              >
                Editar
              </button>
            )}
          </div>

          {editing ? (
            <div className={styles.fieldGrid2}>
              <div className={styles.field}>
                <label>Nombre completo</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className={styles.field}>
                <label>Teléfono</label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+598..."
                />
              </div>
              <div className={styles.fieldFull} style={{ display: "flex", gap: 10 }}>
                <button
                  className={styles.btnSolid}
                  onClick={saveSelfEdits}
                  disabled={saving}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
                <button
                  className={styles.btnGhost}
                  onClick={() => {
                    setEditing(false);
                    setEditName(profile.name);
                    setEditPhone(profile.phone ?? "");
                  }}
                  disabled={saving}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.kvGrid}>
              <KV label="Rol" value={
                isDirector ? (
                  <span className={styles.dirBadge}>Director</span>
                ) : (
                  "Equipo"
                )
              } />
              <KV label="Posición" value={profile.position || "—"} />
              <KV label="Teléfono" value={profile.phone || "—"} />
              <KV label="Inicio" value={profile.start_date || "—"} />
            </div>
          )}
        </div>

        {/* ===== Pago — solo equipo/director (no aplica a clientes) ===== */}
        {!isClient && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitle}>Pago</div>
              {!isDirector && (
                <span className={styles.dim}>
                  Solo el director puede modificar
                </span>
              )}
            </div>
            {hasPayment ? (
              <div className={styles.paymentBox}>
                <div className={styles.paymentAmount}>
                  {profile.payment_currency ?? "USD"}{" "}
                  {Number(profile.payment_amount).toLocaleString()}
                </div>
                <div className={styles.paymentMeta}>
                  {profile.payment_type === "fijo"
                    ? "Pago fijo mensual"
                    : profile.payment_type === "por_proyecto"
                    ? "Pago por proyecto"
                    : profile.payment_type === "por_hora"
                    ? "Pago por hora"
                    : profile.payment_type === "mixto"
                    ? "Pago mixto"
                    : "—"}
                </div>
              </div>
            ) : (
              <div className={styles.empty}>
                Todavía no se cargó información de pago.
                {isDirector
                  ? " Andá a Gestionar equipo para definirla."
                  : " Hablá con el director para que la cargue."}
              </div>
            )}
          </div>
        )}

        {/* ===== Clientes asignados — solo equipo/director (no aplica a clientes) ===== */}
        {!isClient && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitle}>
                Clientes asignados ({assignments.length})
              </div>
            </div>
            {assignments.length === 0 ? (
              <div className={styles.empty}>
                Todavía no tenés clientes asignados.
              </div>
            ) : (
              <div className={styles.assignList}>
                {assignments.map((a) => {
                  const client = clientsById[a.client_id];
                  return (
                    <Link
                      key={`${a.client_id}-${a.role_in_client}`}
                      href={`/cliente/${a.client_id}`}
                      className={styles.assignCard}
                    >
                      <div className={styles.assignInitials}>
                        {client?.initials ?? "??"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className={styles.assignName}>
                          {client?.name ?? a.client_id}
                        </div>
                        <div className={styles.assignSector}>
                          {client?.sector ?? "—"}
                        </div>
                      </div>
                      <div className={styles.assignRole}>{a.role_in_client}</div>
                      <div className={styles.assignArrow}>→</div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== Notificaciones por email ===== */}
        <EmailPreferencesPanel
          profile={profile}
          onUpdated={(p) => setProfile(p)}
        />

        {/* ===== Conexión Outlook ===== */}
        <OutlookPanel profile={profile} onChanged={async () => {
          const p = await getCurrentProfile();
          if (p) setProfile(p);
        }} />

        {profile.notes && isDirector && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitle}>Notas internas</div>
            </div>
            <div className={styles.notes}>{profile.notes}</div>
          </div>
        )}
      </main>
    </>
  );
}

// ============================================================
// EmailPreferencesPanel
// ============================================================
function EmailPreferencesPanel({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: (p: Profile) => void;
}) {
  const [saving, setSaving] = useState(false);
  const PREFS: {
    key:
      | "email_on_new_request"
      | "email_on_task_assigned"
      | "email_on_client_assigned"
      | "email_on_payment_received"
      | "email_on_content_approved";
    label: string;
    desc: string;
    directorOnly?: boolean;
  }[] = [
    {
      key: "email_on_new_request",
      label: "Nuevas solicitudes del cliente",
      desc: "Cuando un cliente sube una solicitud al portal.",
    },
    {
      key: "email_on_task_assigned",
      label: "Tareas asignadas",
      desc: "Cuando me asignan una tarea nueva.",
    },
    {
      key: "email_on_client_assigned",
      label: "Cliente asignado",
      desc: "Cuando me asignan a trabajar con un cliente.",
    },
    {
      key: "email_on_payment_received",
      label: "Cobros recibidos",
      desc: "Cuando una factura se marca como pagada.",
      directorOnly: true,
    },
    {
      key: "email_on_content_approved",
      label: "Contenido aprobado",
      desc: "Cuando una idea de contenido pasa al calendario.",
    },
  ];
  async function toggle(
    key: typeof PREFS[number]["key"],
    value: boolean,
  ) {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await updateProfile(profile.id, { [key]: value } as Record<string, unknown>);
      if (updated) onUpdated(updated);
    } catch (err) {
      console.error("update pref:", err);
      alert("No se pudo guardar la preferencia.");
    } finally {
      setSaving(false);
    }
  }
  const visible = PREFS.filter((p) => !p.directorOnly || profile.role === "director");
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>Notificaciones por email</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        Elegí qué eventos del sistema te llegan por mail. Default = todo activado.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((p) => {
          const current = (profile[p.key] as boolean | undefined) ?? true;
          return (
            <label
              key={p.key}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                background: current ? "var(--off-white)" : "transparent",
                border: `1px solid ${current ? "var(--sand)" : "rgba(10,26,12,0.1)"}`,
                borderRadius: 6,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={current}
                disabled={saving}
                onChange={(e) => toggle(p.key, e.target.checked)}
                style={{ width: "auto", marginTop: 3 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--deep-green)" }}>
                  {p.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {p.desc}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// OutlookPanel — conectar/desconectar Outlook
// ============================================================
function OutlookPanel({
  profile,
  onChanged,
}: {
  profile: Profile;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Detectar query params del callback (?outlook=connected|error&msg=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const ol = p.get("outlook");
    if (ol === "connected") {
      setStatusMsg("✓ Outlook conectado correctamente.");
      onChanged();
      // limpiar URL
      const url = new URL(window.location.href);
      url.searchParams.delete("outlook");
      url.searchParams.delete("email");
      url.searchParams.delete("msg");
      window.history.replaceState({}, "", url.toString());
    } else if (ol === "error") {
      setStatusMsg(`⚠ Error: ${p.get("msg") ?? "no se pudo conectar"}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatusMsg("Sesión expirada. Volvé a entrar.");
        return;
      }
      const res = await fetch("/api/integrations/outlook/connect", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(`⚠ ${data.error ?? "error"}: ${data.detail ?? ""}`);
        return;
      }
      window.location.href = data.auth_url;
    } catch (err) {
      const e = err as Error;
      setStatusMsg(`⚠ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("¿Desconectar tu cuenta de Outlook? Vas a poder reconectar después.")) {
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/integrations/outlook/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as { error?: string }));
        setStatusMsg(`⚠ ${d.error ?? "error"}`);
        return;
      }
      setStatusMsg("Outlook desconectado.");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const connected = !!profile.outlook_connected_at;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>Calendario de Outlook</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Conectá tu cuenta de Outlook personal para que el sistema pueda
        sincronizar eventos a tu calendario (deadlines de tareas, reuniones
        con clientes, fechas de entrega). El acceso queda guardado de
        forma segura y se renueva automáticamente.
      </div>
      {connected ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: 16,
            background: "rgba(47,125,79,0.08)",
            border: "1px solid rgba(47,125,79,0.2)",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: "#0078D4",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 14,
              borderRadius: 6,
            }}
          >
            O
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--deep-green)" }}>
              Conectado: {profile.outlook_email ?? "Outlook"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Desde{" "}
              {profile.outlook_connected_at
                ? new Date(profile.outlook_connected_at).toLocaleDateString("es-AR")
                : "—"}
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={busy}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "1px solid rgba(176,75,58,0.2)",
              borderRadius: 6,
              fontSize: 12,
              cursor: busy ? "wait" : "pointer",
              color: "#B91C1C",
              fontFamily: "inherit",
            }}
          >
            Desconectar
          </button>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={busy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 20px",
            background: "#0078D4",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              width: 20,
              height: 20,
              background: "white",
              color: "#0078D4",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 11,
              borderRadius: 3,
            }}
          >
            O
          </span>
          {busy ? "Conectando…" : "Conectar Outlook"}
        </button>
      )}
      {statusMsg && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: statusMsg.startsWith("⚠")
              ? "rgba(176,75,58,0.08)"
              : "rgba(47,125,79,0.08)",
            border: `1px solid ${
              statusMsg.startsWith("⚠")
                ? "rgba(176,75,58,0.2)"
                : "rgba(47,125,79,0.2)"
            }`,
            borderRadius: 4,
            fontSize: 12,
            color: statusMsg.startsWith("⚠") ? "#B91C1C" : "var(--deep-green)",
          }}
        >
          {statusMsg}
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.kv}>
      <div className={styles.kvLabel}>{label}</div>
      <div className={styles.kvValue}>{value}</div>
    </div>
  );
}
