"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import {
  getTutorial,
  isFullyDocumented,
  type IntegrationField,
} from "@/lib/integration-tutorials";
import styles from "./ConnectIntegrationModal.module.css";

export interface ConnectIntegrationModalProps {
  open: boolean;
  integrationKey: string;
  integrationName: string;
  existingCredentials?: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal de "Conectar herramienta" del portal del cliente.
 *
 * Renderiza el tutorial paso a paso de la integración + un form
 * dinámico con los campos definidos en lib/integration-tutorials.ts.
 * Al guardar hace POST a /api/portal/integrations/connect.
 *
 * Si la integración no tiene tutorial completo (key fuera de los 8
 * priorizados), muestra el fallback con un mensaje explicativo —
 * el guardado igual funciona, solo que con campos opcionales.
 */
export default function ConnectIntegrationModal({
  open,
  integrationKey,
  integrationName,
  existingCredentials,
  onClose,
  onSaved,
}: ConnectIntegrationModalProps) {
  const tutorial = useMemo(
    () => getTutorial(integrationKey),
    [integrationKey],
  );
  const documented = isFullyDocumented(integrationKey);

  const [values, setValues] = useState<Record<string, string>>(
    () => ({ ...(existingCredentials ?? {}) }),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // React 19 pattern: derived state from props during render.
  // Evita el cascading render del useEffect + setState para resetear
  // los inputs cuando el padre selecciona otra integración.
  const [lastKey, setLastKey] = useState(integrationKey);
  if (lastKey !== integrationKey) {
    setLastKey(integrationKey);
    setValues({ ...(existingCredentials ?? {}) });
    setError(null);
    setSubmitting(false);
  }

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  function setField(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Validación local antes del POST
    const missing = tutorial.fields
      .filter((f) => f.required)
      .filter((f) => {
        const v = values[f.key];
        return typeof v !== "string" || v.trim().length === 0;
      });
    if (missing.length > 0) {
      setError(`Faltan datos: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Tu sesión expiró. Volvé a iniciar sesión.");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/portal/integrations/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          key: integrationKey,
          credentials: values,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? `Error ${res.status}.`);
        setSubmitting(false);
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error("connect modal submit error:", err);
      setError("Error de red. Probá de nuevo.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-modal-title"
    >
      <div className={styles.modal}>
        <header className={styles.modalHeader}>
          <div>
            <div className={styles.eyebrow}>Conectar herramienta</div>
            <h2 id="connect-modal-title" className={styles.title}>
              {integrationName}
            </h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.description}>{tutorial.description}</p>

          <div className={styles.callout}>
            <div className={styles.calloutLabel}>Por qué te lo pedimos</div>
            <div className={styles.calloutBody}>{tutorial.whyWeNeedIt}</div>
          </div>

          {!documented && (
            <div className={styles.warning}>
              Todavía no tenemos guía detallada para esta herramienta. Cargá lo
              que sepas y tu account lead te va a contactar para completarla.
            </div>
          )}

          <section className={styles.section}>
            <div className={styles.sectionLabel}>Cómo hacerlo</div>
            <ol className={styles.steps}>
              {tutorial.steps.map((s, i) => (
                <li key={i} className={styles.step}>
                  <div className={styles.stepNumber}>{i + 1}</div>
                  <div className={styles.stepContent}>
                    <div className={styles.stepTitle}>
                      {s.title.replace(/^\d+\.\s*/, "")}
                    </div>
                    <div className={styles.stepBody}>{s.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.sectionLabel}>Tus datos</div>

            {tutorial.fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={values[f.key] ?? ""}
                onChange={(v) => setField(f.key, v)}
                disabled={submitting}
              />
            ))}

            {tutorial.docsUrl && (
              <a
                href={tutorial.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.docsLink}
              >
                Ver documentación oficial ↗
              </a>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={onClose}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={submitting}
              >
                {submitting ? "Guardando…" : "Guardar y conectar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: IntegrationField;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {field.label}
        {field.required && <span className={styles.required}> *</span>}
      </span>
      <input
        className={styles.input}
        type={field.type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />
      <span className={styles.fieldHelp}>{field.helpText}</span>
    </label>
  );
}
