"use client";

import { useEffect, useState } from "react";
import { TEAM_POSITIONS } from "@/lib/supabase/auth";
import { getSupabase } from "@/lib/supabase/client";
import { getClients } from "@/lib/storage";
import type { Client } from "@/lib/types";
import styles from "./NewClientModal.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Modo inicial al abrir: invitar miembro del equipo (default) o cliente del portal. */
  initialUserType?: "team" | "client";
  /** Si initialUserType='client', cliente preseleccionado (para uso desde ClientSidebar). */
  initialClientId?: string;
}

type UserType = "team" | "client";

export default function InviteUserModal({
  open,
  onClose,
  onCreated,
  initialUserType = "team",
  initialClientId,
}: Props) {
  const [userType, setUserType] = useState<UserType>(initialUserType);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(initialClientId ?? "");

  // Campos comunes
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Campos solo para team
  const [position, setPosition] = useState<string>("Account Lead");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("USD");
  const [paymentType, setPaymentType] =
    useState<"fijo" | "por_proyecto" | "por_hora" | "mixto">("fijo");
  const [startDate, setStartDate] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>("");

  // Cargar clientes solo si el director elige "Cliente del portal" (lazy)
  useEffect(() => {
    if (open && userType === "client" && clients.length === 0) {
      getClients().then(setClients);
    }
  }, [open, userType, clients.length]);

  // Reset cuando cambia el initialUserType (ej. abrir desde ClientSidebar)
  useEffect(() => {
    if (open) {
      setUserType(initialUserType);
      if (initialClientId) setClientId(initialClientId);
    }
  }, [open, initialUserType, initialClientId]);

  if (!open) return null;

  const isClient = userType === "client";
  const canSubmit =
    email.trim() &&
    name.trim() &&
    !sending &&
    (!isClient || (isClient && clientId));

  function reset() {
    setEmail("");
    setName("");
    setPhone("");
    setPosition("Account Lead");
    setPaymentAmount("");
    setPaymentCurrency("USD");
    setPaymentType("fijo");
    setStartDate("");
    setClientId(initialClientId ?? "");
    setUserType(initialUserType);
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

      // Body se arma según el tipo de invitación. El endpoint
      // /api/team/invite valida internamente que clientId esté presente
      // si role='client'. Los campos de pago/position solo aplican a team.
      const body = isClient
        ? {
            email: email.trim(),
            name: name.trim(),
            role: "client",
            clientId,
            phone: phone.trim() || undefined,
          }
        : {
            email: email.trim(),
            name: name.trim(),
            role: "team",
            position,
            paymentAmount: paymentAmount ? Number(paymentAmount) : undefined,
            paymentCurrency,
            paymentType,
            startDate: startDate || undefined,
            phone: phone.trim() || undefined,
          };

      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
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

  const eyebrow = isClient ? "Cliente · Invitar al portal" : "Equipo · Invitar persona";
  const title = isClient ? "Acceso al portal del cliente" : "Nuevo miembro del equipo";
  const description = isClient
    ? `Vinculamos esta cuenta al cliente seleccionado. Cuando entre, accede sólo a ${"/portal"} (KPIs, reportes, solicitudes y consultor IA), sin ver datos internos del equipo.`
    : `Le mandamos un email de invitación a ${email || "el correo que pongas"}. Cuando entre, queda registrada con los datos que cargues acá.`;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal} style={{ maxWidth: 640 }}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>

        <div className={styles.eyebrow}>{eyebrow}</div>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.sub}>{description}</p>

        {/* Selector de tipo */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 24,
            padding: 6,
            background: "var(--off-white)",
            border: "1px solid rgba(10,26,12,0.08)",
          }}
        >
          {(["team", "client"] as UserType[]).map((opt) => {
            const active = userType === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setUserType(opt)}
                style={{
                  padding: "10px 14px",
                  border: "none",
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  background: active ? "var(--deep-green)" : "transparent",
                  color: active ? "var(--off-white)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                {opt === "team" ? "Miembro del equipo" : "Cliente del portal"}
              </button>
            );
          })}
        </div>

        {/* Si es cliente: dropdown de clientes existentes */}
        {isClient && (
          <div className={styles.field}>
            <label>Cliente vinculado</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Elegí un cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.sector}
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 6,
                }}
              >
                Cargando clientes…
              </div>
            )}
          </div>
        )}

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                isClient ? "contacto@cliente.com" : "persona@dearmascostantini.com"
              }
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label>Nombre completo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isClient ? "Juan Pérez" : "María González"}
            />
          </div>
        </div>

        {/* Campos solo para team */}
        {!isClient && (
          <>
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
          </>
        )}

        {/* Teléfono también disponible para clientes (al final) */}
        {isClient && (
          <div className={styles.field}>
            <label>Teléfono (opcional)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+598..."
            />
          </div>
        )}

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
            {sending ? "Enviando…" : isClient ? "Invitar al portal →" : "Invitar →"}
          </button>
        </div>
      </div>
    </div>
  );
}
