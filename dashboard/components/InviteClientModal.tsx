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
  // Resultado del POST exitoso: lo guardamos para mostrar credenciales
  // + estado de envío de email al director. Cuando es null, mostramos
  // el form normal.
  const [result, setResult] = useState<{
    email: string;
    password: string;
    emailSent: boolean;
    emailError: string | null;
  } | null>(null);

  if (!open) return null;

  const canSubmit = email.trim() && name.trim() && !sending;

  function reset() {
    setEmail("");
    setName("");
    setPhone("");
    setError("");
    setResult(null);
  }

  function copyToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
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
      // En lugar de cerrar de una, mostramos al director un panel con
      // las credenciales generadas + estado de envío de email — sirve
      // como backup si el mail no llegó.
      setResult({
        email: email.trim(),
        password: data.defaultPassword as string,
        emailSent: !!data.emailSent,
        emailError: data.emailError ?? null,
      });
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
        <button
          className={styles.close}
          onClick={() => {
            reset();
            onClose();
          }}
        >
          ×
        </button>

        {result ? (
          // Vista post-creación: credenciales generadas + estado del mail
          // automático. El director puede copiar la password como
          // backup por si el mail no llega o el cliente la pierde.
          <>
            <div className={styles.eyebrow}>Cliente · Acceso al portal</div>
            <h2 className={styles.title}>Cuenta creada</h2>
            <p className={styles.sub}>
              {result.emailSent
                ? `Ya le mandamos un mail a ${result.email} con las credenciales y las instrucciones para cambiar la contraseña en el primer login.`
                : `Cuenta creada, pero el envío del mail falló. Pasale los datos por WhatsApp o verbalmente — abajo tenés todo para copiar.`}
            </p>

            <div
              style={{
                marginTop: 16,
                padding: 18,
                background: "var(--off-white)",
                borderLeft: "3px solid var(--sand)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--sand-dark)",
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                Credenciales
              </div>
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                <strong>Email:</strong>{" "}
                <span style={{ fontFamily: "monospace" }}>{result.email}</span>{" "}
                <button
                  onClick={() => copyToClipboard(result.email)}
                  style={{
                    marginLeft: 8,
                    fontSize: 10,
                    padding: "2px 8px",
                    background: "transparent",
                    border: "1px solid rgba(10,26,12,0.18)",
                    cursor: "pointer",
                    borderRadius: 3,
                    fontFamily: "inherit",
                    color: "var(--deep-green)",
                  }}
                >
                  copiar
                </button>
              </div>
              <div style={{ fontSize: 13 }}>
                <strong>Contraseña temporal:</strong>{" "}
                <span
                  style={{
                    fontFamily: "monospace",
                    background: "var(--deep-green)",
                    color: "var(--off-white)",
                    padding: "2px 10px",
                    borderRadius: 3,
                    letterSpacing: "0.06em",
                  }}
                >
                  {result.password}
                </span>{" "}
                <button
                  onClick={() => copyToClipboard(result.password)}
                  style={{
                    marginLeft: 8,
                    fontSize: 10,
                    padding: "2px 8px",
                    background: "transparent",
                    border: "1px solid rgba(10,26,12,0.18)",
                    cursor: "pointer",
                    borderRadius: 3,
                    fontFamily: "inherit",
                    color: "var(--deep-green)",
                  }}
                >
                  copiar
                </button>
              </div>
            </div>

            {result.emailError && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: "rgba(176,75,58,0.1)",
                  borderLeft: "3px solid var(--red-warn)",
                  color: "var(--red-warn)",
                  fontSize: 11,
                  lineHeight: 1.5,
                }}
              >
                <strong>El envío del mail falló:</strong> {result.emailError}
              </div>
            )}

            <div
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.55,
              }}
            >
              En el primer login el cliente va a ser redirigido a una
              pantalla para que elija su propia contraseña. Después de
              eso, esta temporal deja de funcionar.
            </div>

            <div className={styles.actions}>
              <button
                className={styles.btnGhost}
                onClick={() => {
                  reset();
                }}
              >
                Crear otra cuenta
              </button>
              <button
                className={styles.btnSolid}
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Listo
              </button>
            </div>
          </>
        ) : (
          <>

        <div className={styles.eyebrow}>Cliente · Acceso al portal</div>
        <h2 className={styles.title}>Invitar a {clientName} al portal</h2>
        <p className={styles.sub}>
          Le mandamos un mail con su email + una contraseña temporal
          única. En el primer login el sistema lo redirige a elegir
          su propia contraseña.
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
          <button
            className={styles.btnGhost}
            onClick={() => {
              reset();
              onClose();
            }}
          >
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
          </>
        )}
      </div>
    </div>
  );
}
