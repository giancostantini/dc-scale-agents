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
        <div
          className={styles.head}
          style={{ display: "flex", alignItems: "center", gap: 22 }}
        >
          <AvatarEditor
            profile={profile}
            onUpdated={(p) => setProfile(p)}
          />
          <div style={{ flex: 1 }}>
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

        {/* ===== Clientes asignados =====
             Antes para directores mostrábamos un cartelito "tenés
             acceso global" en lugar del panel — era engañoso porque
             el director ahora puede ser nombrado formalmente como
             Account Manager / System Manager de un cliente. Ahora
             mostramos el panel completo a todos los no-clientes,
             agregando una nota arriba solo para director explicando
             la dualidad (acceso global + asignación formal).

             La edición (agregar/quitar asignaciones) sigue viviendo
             en /equipo/[id] — acá es solo lista. */}
        {!isClient && (
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitle}>
                Clientes asignados ({assignments.length})
              </div>
            </div>
            {profile.role === "director" && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "var(--off-white)",
                  borderLeft: "3px solid var(--sand)",
                  fontSize: 12,
                  color: "var(--deep-green)",
                  lineHeight: 1.5,
                  marginBottom: 14,
                  borderRadius: "0 4px 4px 0",
                }}
              >
                Como <strong>director</strong>, ya tenés acceso global a
                todos los clientes por tu rol. Estas asignaciones son{" "}
                <strong>formales</strong> — quedan registradas como rol de
                cuenta (típicamente <em>Account Manager</em> o{" "}
                <em>System Manager</em>) y aparecen en el cliente como
                responsable. Si querés agregar una, andá a{" "}
                <Link
                  href="/equipo"
                  style={{
                    color: "var(--deep-green)",
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  Equipo
                </Link>{" "}
                → tu nombre.
              </div>
            )}
            {assignments.length === 0 ? (
              <div className={styles.empty}>
                {profile.role === "director"
                  ? "Todavía no tenés asignaciones formales."
                  : "Todavía no tenés clientes asignados."}
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

        {/* ===== Cambiar contraseña ===== */}
        <ChangePasswordPanel />

        {/* ===== 2FA (autenticación en dos pasos) ===== */}
        <TwoFactorPanel />

        {/* ===== Notificaciones por email ===== */}
        <EmailPreferencesPanel
          profile={profile}
          onUpdated={(p) => setProfile(p)}
        />

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
// TwoFactorPanel — 2FA (TOTP) vía Supabase MFA. OPT-IN: enrolar/desactivar
// desde el perfil. NO se exige al login todavía (enforcement = paso 2, cuando
// todos estén enrolados) para no lockear a nadie.
// ============================================================
interface MfaFactor {
  id: string;
  status: string;
}
function TwoFactorPanel() {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [enrolling, setEnrolling] = useState<{
    factorId: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const { data } = await getSupabase().auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as MfaFactor[]);
    setLoaded(true);
  }
  useEffect(() => {
    refresh();
  }, []);

  const active = factors.find((f) => f.status === "verified");

  async function startEnroll() {
    setError(null);
    setBusy(true);
    // Limpiar factores no verificados colgados de intentos previos. Releemos
    // fresh (el state puede estar viejo) y desenrolamos los no verificados.
    const { data: cur } = await getSupabase().auth.mfa.listFactors();
    await Promise.all(
      ((cur?.totp ?? []) as MfaFactor[])
        .filter((f) => f.status !== "verified")
        .map((f) =>
          getSupabase().auth.mfa.unenroll({ factorId: f.id }).catch(() => {}),
        ),
    );
    // friendlyName ÚNICO para evitar el choque "friendly name already exists".
    const { data, error: enErr } = await getSupabase().auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `D&C ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    });
    setBusy(false);
    if (enErr || !data) {
      setError(enErr?.message ?? "No se pudo iniciar el 2FA.");
      return;
    }
    setEnrolling({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function verifyCode() {
    if (!enrolling) return;
    setError(null);
    setBusy(true);
    const { data: ch, error: chErr } = await getSupabase().auth.mfa.challenge({
      factorId: enrolling.factorId,
    });
    if (chErr || !ch) {
      setBusy(false);
      setError(chErr?.message ?? "Error generando el desafío.");
      return;
    }
    const { error: vErr } = await getSupabase().auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: ch.id,
      code: code.trim(),
    });
    setBusy(false);
    if (vErr) {
      setError("Código incorrecto. Revisá la app y probá de nuevo.");
      return;
    }
    setEnrolling(null);
    setCode("");
    await refresh();
  }

  async function disableMfa() {
    if (!active) return;
    if (!window.confirm("¿Desactivar el 2FA de tu cuenta?")) return;
    setBusy(true);
    await getSupabase()
      .auth.mfa.unenroll({ factorId: active.id })
      .catch(() => {});
    setBusy(false);
    await refresh();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>Autenticación en dos pasos (2FA)</div>
        {loaded && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: active ? "var(--green-ok)" : "var(--text-muted)",
            }}
          >
            {active ? "● Activa" : "○ Inactiva"}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Agregá un segundo factor con una app de autenticación (Google
        Authenticator, Authy, 1Password…). Recomendado, sobre todo para acceder
        a la bóveda de credenciales.
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            background: "rgba(176,75,58,0.08)",
            border: "1px solid rgba(176,75,58,0.2)",
            borderRadius: 4,
            fontSize: 12,
            color: "#B91C1C",
          }}
        >
          {error}
        </div>
      )}

      {active ? (
        <button
          onClick={disableMfa}
          disabled={busy}
          style={{
            padding: "9px 16px",
            background: "transparent",
            border: "1px solid rgba(176,75,58,0.25)",
            borderRadius: 6,
            fontSize: 12,
            color: "#B91C1C",
            cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Desactivar 2FA
        </button>
      ) : enrolling ? (
        <div>
          <div style={{ fontSize: 12.5, color: "var(--deep-green)", marginBottom: 10 }}>
            1. Escaneá este QR con tu app. 2. Ingresá el código de 6 dígitos.
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div
              style={{
                background: "var(--white)",
                padding: 8,
                border: "1px solid var(--hairline)",
                borderRadius: 8,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrolling.qr} alt="QR para 2FA" width={172} height={172} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                ¿No podés escanear? Cargá esta clave manualmente:
              </div>
              <code
                style={{
                  display: "block",
                  fontSize: 11,
                  wordBreak: "break-all",
                  background: "var(--off-white)",
                  padding: "6px 8px",
                  borderRadius: 4,
                  marginBottom: 12,
                }}
              >
                {enrolling.secret}
              </code>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Código de 6 dígitos"
                inputMode="numeric"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid rgba(10,26,12,0.15)",
                  borderRadius: 6,
                  fontSize: 14,
                  letterSpacing: "0.3em",
                  fontFamily: "monospace",
                  marginBottom: 10,
                }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={verifyCode}
                  disabled={busy || code.length !== 6}
                  style={{
                    padding: "9px 16px",
                    background: "var(--deep-green)",
                    color: "var(--off-white)",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: busy || code.length !== 6 ? "default" : "pointer",
                    opacity: busy || code.length !== 6 ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {busy ? "Verificando…" : "Verificar y activar"}
                </button>
                <button
                  onClick={() => {
                    setEnrolling(null);
                    setCode("");
                    setError(null);
                  }}
                  disabled={busy}
                  style={{
                    padding: "9px 16px",
                    background: "transparent",
                    border: "1px solid var(--hairline)",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={startEnroll}
          disabled={busy || !loaded}
          style={{
            padding: "9px 16px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {busy ? "…" : "Activar 2FA"}
        </button>
      )}
    </div>
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
  type PrefKey =
    | "email_on_new_request"
    | "email_on_task_assigned"
    | "email_on_client_assigned"
    | "email_on_payment_received"
    | "email_on_content_approved"
    | "weekly_digest_enabled";
  type PrefDef = {
    key: PrefKey;
    label: string;
    desc: string;
    /** Si está seteado, este pref SOLO se muestra a esos roles.
     *  Si no, se muestra a todos. */
    onlyRoles?: ("director" | "team" | "client")[];
  };
  const PREFS: PrefDef[] = [
    {
      key: "email_on_new_request",
      label: "Nuevas solicitudes del cliente",
      desc: "Cuando un cliente sube una solicitud al portal.",
      onlyRoles: ["director", "team"],
    },
    {
      key: "email_on_task_assigned",
      label: "Tareas asignadas",
      desc: "Cuando te asignan una tarea nueva pendiente.",
    },
    {
      key: "email_on_client_assigned",
      label: "Cliente asignado",
      desc: "Cuando me asignan a trabajar con un cliente.",
      onlyRoles: ["team"],
    },
    {
      key: "email_on_payment_received",
      label: "Cobros recibidos",
      desc: "Cuando una factura se marca como pagada.",
      onlyRoles: ["director"],
    },
    {
      key: "email_on_content_approved",
      label: "Contenido aprobado",
      desc: "Cuando una idea de contenido pasa al calendario.",
      onlyRoles: ["director", "team"],
    },
    {
      key: "weekly_digest_enabled",
      label: "Newsletter (tendencias del mercado)",
      desc: "Reporte semanal de tendencias de tu sector + lo que está funcionando ahora en el nicho. Llega como digest los lunes.",
      onlyRoles: ["client"],
    },
  ];
  async function toggle(
    key: PrefKey,
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
  // Filtramos por rol — si el pref tiene onlyRoles, solo se muestra a
  // los roles listados. Los sin onlyRoles aparecen para todos (compat).
  const visible = PREFS.filter((p) => {
    if (!p.onlyRoles) return true;
    return p.onlyRoles.includes(
      profile.role as "director" | "team" | "client",
    );
  });
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

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.kv}>
      <div className={styles.kvLabel}>{label}</div>
      <div className={styles.kvValue}>{value}</div>
    </div>
  );
}

// ============================================================
// ChangePasswordPanel — permite que cualquier usuario logueado
// cambie su propia contraseña sin tener que pasar por el email de
// recovery.  Usa supabase.auth.updateUser({ password }) — funciona
// para director, team y client por igual.
// ============================================================
function ChangePasswordPanel() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("La contraseña tiene que tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabase();
      const { error: updErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updErr) throw updErr;
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      // El "success" se limpia solo después de unos segundos.
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      const e = err as Error;
      setError(e.message || "No se pudo cambiar la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>Cambiar contraseña</div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        Setea una nueva contraseña para tu cuenta. Mínimo 8 caracteres.
      </div>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div className={styles.field}>
          <label>Nueva contraseña</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={saving}
          />
        </div>
        <div className={styles.field}>
          <label>Confirmar contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={saving}
          />
        </div>
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="submit"
            disabled={saving || !newPassword || !confirmPassword}
            style={{
              padding: "10px 20px",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              cursor:
                saving || !newPassword || !confirmPassword
                  ? "default"
                  : "pointer",
              fontFamily: "inherit",
              opacity: saving || !newPassword || !confirmPassword ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando…" : "Guardar nueva contraseña"}
          </button>
          {error && (
            <span
              style={{
                fontSize: 12,
                color: "#B91C1C",
                flex: 1,
                minWidth: 200,
              }}
            >
              ⚠ {error}
            </span>
          )}
          {success && (
            <span
              style={{
                fontSize: 12,
                color: "var(--green-ok)",
                fontWeight: 600,
              }}
            >
              ✓ Contraseña actualizada
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

// ============================================================
// AvatarEditor — circulito con foto + botón para subir/cambiar.
// El path en Storage es {user_id}/avatar.{ext}; al actualizar se
// reemplaza el anterior (upsert).
// ============================================================
function AvatarEditor({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: (p: Profile) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > 2 * 1024 * 1024) {
      setError("Máximo 2 MB.");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setError("Formato no soportado. Usá JPG, PNG, WEBP o GIF.");
      return;
    }

    setUploading(true);
    try {
      const supabase = getSupabase();
      // Mantenemos un nombre estable por usuario para que cada upload
      // reemplace el anterior (upsert: true). Extraemos extensión
      // del MIME para soportar gif/webp además de jpg/png.
      const extByMime: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
      };
      const ext = extByMime[file.type] ?? "jpg";
      const path = `${profile.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });
      if (upErr) throw upErr;

      // Obtener URL pública. Le agregamos cache-bust con timestamp
      // porque el CDN cachea por path y al reemplazar el archivo
      // necesitamos forzar refresh en los avatars que ya se mostraron.
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const cacheBusted = `${pub.publicUrl}?t=${Date.now()}`;

      const updated = await updateProfile(profile.id, {
        avatar_url: cacheBusted,
      });
      if (updated) onUpdated(updated);
    } catch (err) {
      const e = err as Error;
      setError(`No se pudo subir: ${e.message}`);
    } finally {
      setUploading(false);
      // Reset el input para permitir subir el mismo archivo otra vez
      // (Chrome no dispara onChange si el filename no cambia).
      e.target.value = "";
    }
  }

  async function handleRemove() {
    if (!profile.avatar_url) return;
    if (!confirm("¿Quitar tu foto de perfil?")) return;
    setUploading(true);
    setError(null);
    try {
      // Borrar el blob — intentamos las 4 extensiones porque no
      // sabemos cuál subió.
      const supabase = getSupabase();
      const tryPaths = ["jpg", "png", "webp", "gif"].map(
        (ext) => `${profile.id}/avatar.${ext}`,
      );
      await supabase.storage.from("avatars").remove(tryPaths);
      const updated = await updateProfile(profile.id, { avatar_url: null });
      if (updated) onUpdated(updated);
    } catch (err) {
      const e = err as Error;
      setError(`No se pudo borrar: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        style={{
          width: 86,
          height: 86,
          borderRadius: "50%",
          background: profile.avatar_url ? "var(--off-white)" : "var(--deep-green)",
          color: "var(--sand)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 26,
          overflow: "hidden",
          border: "1px solid var(--hairline)",
          letterSpacing: "0.05em",
        }}
      >
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={profile.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          profile.initials
        )}
      </div>

      {/* Botón flotante de cambiar — abajo a la derecha del círculo */}
      <label
        style={{
          position: "absolute",
          bottom: -2,
          right: -2,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--deep-green)",
          color: "var(--off-white)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          cursor: uploading ? "default" : "pointer",
          border: "2px solid var(--white)",
          opacity: uploading ? 0.6 : 1,
        }}
        title={profile.avatar_url ? "Cambiar foto" : "Subir foto"}
      >
        {uploading ? "…" : "✎"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
          disabled={uploading}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            cursor: uploading ? "default" : "pointer",
          }}
        />
      </label>

      {profile.avatar_url && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--white)",
            color: "#B91C1C",
            border: "1px solid rgba(176,75,58,0.2)",
            cursor: "pointer",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "inherit",
            padding: 0,
            lineHeight: 1,
          }}
          title="Quitar foto"
        >
          ×
        </button>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            left: 100,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 11,
            color: "#B91C1C",
            background: "rgba(176,75,58,0.08)",
            border: "1px solid rgba(176,75,58,0.2)",
            padding: "5px 9px",
            borderRadius: 4,
            whiteSpace: "nowrap",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
