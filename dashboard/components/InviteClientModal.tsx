"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./NewClientModal.module.css";

interface Props {
  open: boolean;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onCreated?: () => void;
}

/**
 * Modal para que el director invite al cliente final al portal.
 * Crea un user con role='client' y client_id setteado.
 */
export default function InviteClientModal({
  open,
  clientId,
  clientName,
  onClose,
  onCreated,
}: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const canSubmit = email.trim() && name.trim() && !sending;

  function reset() {
    setEmail("");
    setName("");
    setPhone("");
    setError("");
  }

  async function submit() {
    if (!canSubmit) return;
    setSending(true);
    setError("");
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Sesión expirada. Volvé a iniciar sesión.");
        return;
      }

      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          role: "client",
          clientId,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(`${data.error ?? "Error desconocido"}${data.hint ? `\n${data.hint}` : ""}`);
        return;
      }
      reset();
      onClose();
      onCreated?.();
    } catch (err) {
      console.error("invite client error:", err);
      setError("Error de red. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 540 }}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>Cliente · Acceso al portal</div>
        <h2 className={styles.title}>Invitar a {clientName} al portal</h2>
        <p className={styles.sub}>
          Mandamos un email de invitación. Cuando lo abre y crea contraseña,
          puede entrar al portal con acceso de solo lectura a sus métricas,
          reportes aprobados, contenido publicado y consultor IA.
        </p>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Email del contacto</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dueño@empresa.com"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label>Nombre completo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mariana López"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>Teléfono (opcional)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+598..."
          />
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 14,
            background: "var(--off-white)",
            borderLeft: "3px solid var(--sand)",
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.55,
          }}
        >
          ℹ️ Podés invitar varias personas de la misma empresa: cada una
          tiene su propio login con acceso al mismo portal de {clientName}.
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "rgba(176,75,58,0.1)",
              borderLeft: "3px solid var(--red-warn)",
              color: "var(--red-warn)",
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={styles.btnSolid}
            onClick={submit}
            disabled={!canSubmit}
          >
            {sending ? "Enviando…" : "Invitar →"}
          </button>
        </div>
      </div>
    </div>
  );
}
