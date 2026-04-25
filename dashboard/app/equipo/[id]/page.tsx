"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
  type ClientAssignment,
  TEAM_POSITIONS,
  CLIENT_ROLES,
} from "@/lib/supabase/auth";
import {
  getProfile,
  updateProfile,
  listAssignmentsForUser,
  addAssignment,
  removeAssignment,
} from "@/lib/team";
import { getClients } from "@/lib/storage";
import type { Client } from "@/lib/types";
import styles from "../equipo.module.css";
import detail from "./detail.module.css";

export default function EquipoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<Profile | null>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // edit fields
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editRole, setEditRole] = useState<"director" | "team">("team");
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentCurrency, setEditPaymentCurrency] = useState("USD");
  const [editPaymentType, setEditPaymentType] = useState<
    "fijo" | "por_proyecto" | "por_hora" | "mixto"
  >("fijo");
  const [editStartDate, setEditStartDate] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // assignment form
  const [asgClientId, setAsgClientId] = useState("");
  const [asgRole, setAsgRole] = useState<string>(CLIENT_ROLES[0]);
  const [asgError, setAsgError] = useState("");

  async function loadAssignments() {
    const a = await listAssignmentsForUser(id);
    setAssignments(a);
  }

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      setAuthChecked(true);
      const [meP, p, clis] = await Promise.all([
        getCurrentProfile(),
        getProfile(id),
        getClients(),
      ]);
      setMe(meP);
      setProfile(p);
      setClients(clis);
      if (p) {
        setEditName(p.name);
        setEditPosition(p.position ?? "");
        setEditRole(p.role);
        setEditPaymentAmount(
          p.payment_amount != null ? String(p.payment_amount) : "",
        );
        setEditPaymentCurrency(p.payment_currency ?? "USD");
        setEditPaymentType(p.payment_type ?? "fijo");
        setEditStartDate(p.start_date ?? "");
        setEditPhone(p.phone ?? "");
        setEditNotes(p.notes ?? "");
        await loadAssignments();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  if (!authChecked || profile === undefined || me === null) return null;
  if (profile === null) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main className={styles.wrap}>
          <Link href="/equipo" className={styles.btnGhost}>
            ← Volver al equipo
          </Link>
          <h1 style={{ marginTop: 24 }}>Persona no encontrada</h1>
        </main>
      </>
    );
  }

  const isDirector = me.role === "director";
  const isSelf = me.id === profile.id;
  const canEdit = isDirector; // los miembros editan su propio perfil desde /perfil

  async function save() {
    if (!profile || !canEdit) return;
    setSaving(true);
    try {
      const updated = await updateProfile(profile.id, {
        name: editName.trim() || profile.name,
        position: editPosition || null,
        role: editRole,
        payment_amount: editPaymentAmount
          ? Number(editPaymentAmount) || null
          : null,
        payment_currency: editPaymentCurrency || null,
        payment_type: editPaymentType,
        start_date: editStartDate || null,
        phone: editPhone || null,
        notes: editNotes || null,
      });
      if (updated) setProfile(updated);
      alert("Cambios guardados.");
    } catch (err) {
      console.error("update profile error:", err);
      alert(
        "No se pudo guardar. Asegurate de ser director y de que la migration 004 esté aplicada en Supabase.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAssignment() {
    setAsgError("");
    if (!asgClientId) {
      setAsgError("Elegí un cliente.");
      return;
    }
    if (!profile) return;
    try {
      await addAssignment({
        client_id: asgClientId,
        user_id: profile.id,
        role_in_client: asgRole,
      });
      await loadAssignments();
      setAsgClientId("");
    } catch (err) {
      console.error("add assignment error:", err);
      const e = err as { code?: string; message?: string };
      if (e.code === "23505") {
        setAsgError("Ya existe esta asignación (mismo cliente y rol).");
      } else {
        setAsgError(e.message ?? "No se pudo asignar.");
      }
    }
  }

  async function handleRemoveAssignment(a: ClientAssignment) {
    if (!confirm(`¿Quitar a ${profile?.name} como ${a.role_in_client} del cliente?`)) {
      return;
    }
    try {
      await removeAssignment(a.client_id, a.user_id, a.role_in_client);
      await loadAssignments();
    } catch (err) {
      console.error("remove assignment error:", err);
      alert("No se pudo quitar la asignación.");
    }
  }

  const assignedClientIds = new Set(assignments.map((a) => a.client_id));
  const availableClients = clients.filter(
    (c) => !assignedClientIds.has(c.id) || asgRole !== assignments.find((a) => a.client_id === c.id)?.role_in_client,
  );

  return (
    <>
      <Topbar showPrimary={false} />

      <main className={styles.wrap}>
        <Link href="/equipo" className={detail.back}>
          ← Volver al equipo
        </Link>

        <div className={styles.head} style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div className={detail.avatar}>{profile.initials}</div>
            <div>
              <div className={styles.eyebrow}>
                {profile.role === "director" ? "Director" : "Equipo"}
              </div>
              <h1>{profile.name}</h1>
              <div className={styles.sub}>
                {profile.email}
                {isSelf && <span className={detail.youTag}> · Vos</span>}
              </div>
            </div>
          </div>
          <div className={styles.actions}>
            {isSelf && (
              <Link href="/perfil" className={styles.btnGhost}>
                Ir a mi perfil
              </Link>
            )}
          </div>
        </div>

        {!canEdit && (
          <div className={detail.banner}>
            Solo el director puede editar a otros miembros.
          </div>
        )}

        {/* ===== Identidad + Rol ===== */}
        <Section title="Identidad y rol">
          <div className={detail.fieldGrid2}>
            <Field
              label="Nombre"
              value={editName}
              setValue={setEditName}
              disabled={!canEdit}
            />
            <SelectField
              label="Posición en la firma"
              value={editPosition}
              setValue={setEditPosition}
              options={[""].concat(TEAM_POSITIONS.map((p) => p))}
              disabled={!canEdit}
            />
            <SelectField
              label="Rol en el sistema"
              value={editRole}
              setValue={(v) => setEditRole(v as "director" | "team")}
              options={["team", "director"]}
              disabled={!canEdit}
            />
            <Field
              label="Teléfono"
              value={editPhone}
              setValue={setEditPhone}
              disabled={!canEdit}
            />
            <Field
              label="Fecha de inicio"
              type="date"
              value={editStartDate}
              setValue={setEditStartDate}
              disabled={!canEdit}
            />
          </div>
        </Section>

        {/* ===== Pago ===== */}
        <Section title="Pago">
          <div className={detail.fieldGrid3}>
            <SelectField
              label="Tipo"
              value={editPaymentType}
              setValue={(v) =>
                setEditPaymentType(
                  v as "fijo" | "por_proyecto" | "por_hora" | "mixto",
                )
              }
              options={["fijo", "por_proyecto", "por_hora", "mixto"]}
              disabled={!canEdit}
            />
            <Field
              label="Monto"
              type="number"
              value={editPaymentAmount}
              setValue={setEditPaymentAmount}
              disabled={!canEdit}
            />
            <SelectField
              label="Moneda"
              value={editPaymentCurrency}
              setValue={setEditPaymentCurrency}
              options={["USD", "UYU", "ARS", "EUR"]}
              disabled={!canEdit}
            />
          </div>
        </Section>

        {/* ===== Notas ===== */}
        {canEdit && (
          <Section title="Notas internas (privadas)">
            <textarea
              className={detail.textarea}
              rows={4}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Notas privadas para directores: contacto, banco, recordatorios..."
              disabled={!canEdit}
            />
          </Section>
        )}

        {canEdit && (
          <div className={detail.saveRow}>
            <button
              className={styles.btnSolid}
              onClick={save}
              disabled={saving}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        )}

        {/* ===== Asignaciones a clientes ===== */}
        <Section title={`Clientes asignados (${assignments.length})`}>
          {assignments.length === 0 ? (
            <div className={detail.empty}>
              Sin asignaciones todavía.
            </div>
          ) : (
            <div className={detail.assignList}>
              {assignments.map((a) => {
                const c = clients.find((c) => c.id === a.client_id);
                return (
                  <div
                    key={`${a.client_id}-${a.role_in_client}`}
                    className={detail.assignRow}
                  >
                    <Link
                      href={`/cliente/${a.client_id}`}
                      style={{ textDecoration: "none", color: "inherit", flex: 1, display: "flex", alignItems: "center", gap: 14 }}
                    >
                      <div className={detail.assignInitials}>
                        {c?.initials ?? "??"}
                      </div>
                      <div>
                        <div className={detail.assignName}>
                          {c?.name ?? a.client_id}
                        </div>
                        <div className={detail.assignSector}>
                          {c?.sector ?? "—"}
                        </div>
                      </div>
                    </Link>
                    <div className={detail.assignRole}>
                      {a.role_in_client}
                    </div>
                    <div className={detail.assignSince}>
                      desde {a.since}
                    </div>
                    {canEdit && (
                      <button
                        className={detail.removeBtn}
                        onClick={() => handleRemoveAssignment(a)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canEdit && (
            <div className={detail.addAsg}>
              <div className={detail.addAsgRow}>
                <select
                  className={detail.input}
                  value={asgClientId}
                  onChange={(e) => setAsgClientId(e.target.value)}
                >
                  <option value="">— elegí un cliente —</option>
                  {availableClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.sector}
                    </option>
                  ))}
                </select>
                <select
                  className={detail.input}
                  value={asgRole}
                  onChange={(e) => setAsgRole(e.target.value)}
                >
                  {CLIENT_ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button
                  className={styles.btnSolid}
                  onClick={handleAddAssignment}
                  disabled={!asgClientId}
                >
                  Asignar
                </button>
              </div>
              {asgError && <div className={detail.asgError}>{asgError}</div>}
            </div>
          )}
        </Section>
      </main>
    </>
  );
}

// ============ subcomponents ============
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={detail.panel}>
      <div className={detail.panelHead}>{title}</div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  setValue,
  type,
  disabled,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className={detail.field}>
      <label>{label}</label>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  setValue,
  options,
  disabled,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div className={detail.field}>
      <label>{label}</label>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </div>
  );
}
