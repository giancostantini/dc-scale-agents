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

        {/* ===== Pago ===== */}
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

        {/* ===== Clientes asignados ===== */}
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

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.kv}>
      <div className={styles.kvLabel}>{label}</div>
      <div className={styles.kvValue}>{value}</div>
    </div>
  );
}
