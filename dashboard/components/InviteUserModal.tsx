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
  /** Credenciales por defecto que el server crea para el usuario.
   *  El director se las pasa al miembro por WhatsApp / verbalmente.
   *  El usuario cambia la password al entrar desde /perfil. */
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [credsCopied, setCredsCopied] = useState(false);
  // Legacy: el server viejo devolvía un link. Mantenemos por compat
  // en caso de que el cliente esté en un deploy nuevo y el server
  // viejo (o viceversa).
  const [manualInviteLink, setManualInviteLink] = useState<string | null>(null);
  const [smtpWarning, setSmtpWarning] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Cargar clientes solo si el director elige "Cliente del portal" (lazy)
  useEffect(() => {
    if (open && userType === "client" && clients.length === 0) {
      getClients().then(setClients);
    }
  }, [open, userType, clients.length]);

  // Reset cuando cambia el initialUserType (ej. abrir desde ClientSidebar).
  // Patrón React 19: state derivation durante el render en lugar de
  // useEffect + setState (evita el cascading render).
  const [lastInitial, setLastInitial] = useState({
    userType: initialUserType,
    clientId: initialClientId,
    open,
  });
  if (
    open &&
    (lastInitial.userType !== initialUserType ||
      lastInitial.clientId !== initialClientId ||
      !lastInitial.open)
  ) {
    setLastInitial({ userType: initialUserType, clientId: initialClientId, open });
    setUserType(initialUserType);
    if (initialClientId) setClientId(initialClientId);
  } else if (!open && lastInitial.open) {
    setLastInitial((prev) => ({ ...prev, open: false }));
  }

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
    setManualInviteLink(null);
    setSmtpWarning(null);
    setLinkCopied(false);
    setCreatedCredentials(null);
    setCredsCopied(false);
  }

  async function submit() {
    if (!canSubmit) return;
    setSending(true);
    setError("");
    setManualInviteLink(null);
    setSmtpWarning(null);
    setLinkCopied(false);
    setCreatedCredentials(null);
    setCredsCopied(false);

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

      // Caso nuevo: el server creó el usuario con password default y
      // devuelve credenciales para que el director las pase al
      // usuario.
      if (data.defaultPassword) {
        setCreatedCredentials({
          email: email.trim(),
          password: data.defaultPassword,
        });
        onCreated?.();
        return;
      }

      // Caso legacy: server viejo devuelve un inviteLink en lugar de
      // password default. Lo mostramos igual.
      if (data.inviteLink) {
        setManualInviteLink(data.inviteLink);
        setSmtpWarning(data.smtpWarning ?? null);
        onCreated?.();
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
    ? `Vinculamos esta cuenta al cliente seleccionado. Cuando entre, accede sólo a ${"/portal"} (KPIs, reportes, solicitudes y D&C Advisor), sin ver datos internos del equipo.`
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

        {/* Credenciales por defecto: aparece cuando el server crea el
            usuario con password fija. El director copia las dos cosas
            (email + password) y se las pasa al miembro por WhatsApp /
            verbalmente. El miembro entra y cambia la password desde
            /perfil. */}
        {createdCredentials && (
          <div
            style={{
              padding: 16,
              background: "rgba(47,125,79,0.08)",
              borderLeft: "3px solid var(--green-ok)",
              fontSize: 12,
              marginTop: 10,
              borderRadius: 4,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "var(--green-ok)",
                marginBottom: 6,
              }}
            >
              Usuario creado · Pasale estos datos
            </div>
            <div
              style={{
                color: "var(--deep-green)",
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              Mandale por WhatsApp o decile en persona. Cuando entre,
              que cambie la contraseña desde su perfil → "Cambiar contraseña".
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "8px 14px",
                alignItems: "center",
                background: "var(--white)",
                padding: 12,
                borderRadius: 4,
                border: "1px solid rgba(10,26,12,0.08)",
                fontSize: 13,
                fontFamily: "monospace",
                marginBottom: 10,
              }}
            >
              <strong
                style={{
                  fontFamily: "inherit",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                }}
              >
                Email
              </strong>
              <span style={{ color: "var(--deep-green)", userSelect: "all" }}>
                {createdCredentials.email}
              </span>
              <strong
                style={{
                  fontFamily: "inherit",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                }}
              >
                Contraseña
              </strong>
              <span style={{ color: "var(--deep-green)", userSelect: "all" }}>
                {createdCredentials.password}
              </span>
            </div>
            <button
              type="button"
              onClick={async () => {
                const text = `Email: ${createdCredentials.email}\nContraseña: ${createdCredentials.password}\n\nCuando entres, cambiá la contraseña desde tu perfil → "Cambiar contraseña".`;
                try {
                  await navigator.clipboard.writeText(text);
                  setCredsCopied(true);
                  setTimeout(() => setCredsCopied(false), 2000);
                } catch {
                  // ignore — el director puede copiar a mano
                }
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: 12,
                fontWeight: 600,
                background: credsCopied ? "var(--green-ok)" : "var(--deep-green)",
                color: "var(--off-white)",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.04em",
              }}
            >
              {credsCopied ? "✓ Copiado" : "Copiar credenciales"}
            </button>
          </div>
        )}

        {/* Link de invitación manual: aparece cuando el SMTP falló y
            el server hizo fallback con generateLink. El director copia
            el link y se lo manda al usuario por otro medio. */}
        {manualInviteLink && (
          <div
            style={{
              padding: 16,
              background: "rgba(196,168,130,0.1)",
              borderLeft: "3px solid var(--sand-dark)",
              fontSize: 12,
              marginTop: 10,
              borderRadius: 4,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "var(--sand-dark)",
                marginBottom: 6,
              }}
            >
              Usuario creado · Compartí este link
            </div>
            <div
              style={{
                color: "var(--deep-green)",
                lineHeight: 1.5,
                marginBottom: 10,
              }}
            >
              {smtpWarning ??
                "El email no se pudo mandar. Copiale este link al usuario por WhatsApp / mail / etc para que setee su contraseña."}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "stretch",
              }}
            >
              <input
                readOnly
                value={manualInviteLink}
                onClick={(e) => e.currentTarget.select()}
                style={{
                  flex: 1,
                  padding: "9px 11px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  border: "1px solid rgba(10,26,12,0.15)",
                  borderRadius: 4,
                  background: "var(--white)",
                  color: "var(--deep-green)",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(manualInviteLink);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  } catch {
                    // ignore — el usuario puede copiar a mano
                  }
                }}
                style={{
                  padding: "9px 14px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: linkCopied ? "var(--green-ok)" : "var(--deep-green)",
                  color: "var(--off-white)",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}
              >
                {linkCopied ? "✓ Copiado" : "Copiar link"}
              </button>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.btnGhost}
            onClick={() => {
              if (manualInviteLink || createdCredentials) reset();
              onClose();
            }}
          >
            {manualInviteLink || createdCredentials ? "Listo" : "Cancelar"}
          </button>
          {!manualInviteLink && !createdCredentials && (
            <button
              className={styles.btnSolid}
              onClick={submit}
              disabled={!canSubmit}
            >
              {sending ? "Creando…" : isClient ? "Crear acceso al portal →" : "Crear usuario →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
