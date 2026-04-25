"use client";

import { useState } from "react";
import { TEAM_POSITIONS } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./NewClientModal.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function InviteUserModal({ open, onClose, onCreated }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState<string>("Account Lead");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("USD");
  const [paymentType, setPaymentType] =
    useState<"fijo" | "por_proyecto" | "por_hora" | "mixto">("fijo");
  const [startDate, setStartDate] = useState("");
  const [phone, setPhone] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>("");

  if (!open) return null;

  const canSubmit = email.trim() && name.trim() && !sending;

  function reset() {
    setEmail("");
    setName("");
    setPosition("Account Lead");
    setPaymentAmount("");
    setPaymentCurrency("USD");
    setPaymentType("fijo");
    setStartDate("");
    setPhone("");
    setError("");
  }

  async function submit() {
    if (!canSubmit) return;
    setSending(true);
    setError("");

    try {
      // Necesitamos pasar el JWT del director al endpoint para que
      // el server-side valide el rol antes de invitar.
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
          position,
          paymentAmount: paymentAmount ? Number(paymentAmount) : undefined,
          paymentCurrency,
          paymentType,
          startDate: startDate || undefined,
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
      console.error("invite error:", err);
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
      <div className={styles.modal} style={{ maxWidth: 640 }}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>Equipo · Invitar persona</div>
        <h2 className={styles.title}>Nuevo miembro del equipo</h2>
        <p className={styles.sub}>
          Le mandamos un email de invitación a {email || "el correo que pongas"}
          . Cuando entre, queda registrada con los datos que cargues acá.
        </p>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@dearmascostantini.com"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label>Nombre completo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="María González"
            />
          </div>
        </div>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Posición / rol en la firma</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              {TEAM_POSITIONS.filter((p) => p !== "Director").map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Teléfono</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+598..."
            />
          </div>
        </div>

        <div className={styles.sectionLabel}>Pago</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
          }}
        >
          <div className={styles.field}>
            <label>Tipo</label>
            <select
              value={paymentType}
              onChange={(e) =>
                setPaymentType(
                  e.target.value as
                    | "fijo"
                    | "por_proyecto"
                    | "por_hora"
                    | "mixto",
                )
              }
            >
              <option value="fijo">Fijo mensual</option>
              <option value="por_proyecto">Por proyecto</option>
              <option value="por_hora">Por hora</option>
              <option value="mixto">Mixto</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Monto</label>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="2500"
            />
          </div>
          <div className={styles.field}>
            <label>Moneda</label>
            <select
              value={paymentCurrency}
              onChange={(e) => setPaymentCurrency(e.target.value)}
            >
              <option>USD</option>
              <option>UYU</option>
              <option>ARS</option>
              <option>EUR</option>
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label>Fecha de inicio</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        {error && (
          <div
            style={{
              padding: 14,
              background: "rgba(176,75,58,0.1)",
              borderLeft: "3px solid var(--red-warn)",
              color: "var(--red-warn)",
              fontSize: 12,
              marginTop: 10,
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
