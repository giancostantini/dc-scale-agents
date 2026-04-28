"use client";

import { useState } from "react";

interface RebrandbookModalProps {
  open: boolean;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onSuccess: (toastMessage: string) => void;
}

/**
 * Modal para cargar o re-procesar el brandbook de un cliente.
 *
 * Acepta:
 *   - PDF (extracción auto con pdf-extract.ts si <100MB)
 *   - Texto pegado en textarea
 *   - URL opcional al PDF master en Drive
 *
 * Submit dispatcha al brandbook-processor con reprocess=true. Si ya hay
 * brand/ procesado, esa versión se archiva en _archive/<timestamp>/.
 */
export default function RebrandbookModal({
  open,
  clientId,
  clientName,
  onClose,
  onSuccess,
}: RebrandbookModalProps) {
  const [brandbookText, setBrandbookText] = useState("");
  const [brandbookUrl, setBrandbookUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function reset() {
    setBrandbookText("");
    setBrandbookUrl("");
    setExtracting(false);
    setProgress(null);
    setError(null);
    setSubmitting(false);
  }

  async function handlePdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > 100 * 1024 * 1024) {
      setError(
        `Tu PDF pesa ${(file.size / (1024 * 1024)).toFixed(0)} MB. Es muy grande para procesar en el browser. Abrilo en ChatGPT/Claude/Gemini y pegá el texto en el textarea.`,
      );
      return;
    }
    setExtracting(true);
    setProgress("Cargando PDF…");
    try {
      const { extractPdfText } = await import("@/lib/pdf-extract");
      const text = await extractPdfText(file, (msg) => setProgress(msg));
      setBrandbookText(text);
      setProgress(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(`No se pudo extraer el texto: ${msg}`);
      setProgress(null);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (brandbookText.trim().length < 200) {
      setError("El texto del brandbook tiene que tener al menos 200 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brandbook/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandbookText,
          brandbookUrl: brandbookUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error procesando");
      onSuccess(
        `↻ Re-procesando brandbook de ${clientName} · run #${data.runId}. La página se actualiza en 60s.`,
      );
      reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (extracting || submitting) return;
    reset();
    onClose();
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.5)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          background: "var(--white)",
          maxWidth: 720,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 32,
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={extracting || submitting}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "transparent",
            border: "none",
            fontSize: 24,
            cursor: extracting || submitting ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
          }}
        >
          ×
        </button>

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          ↻ Re-procesar brandbook
        </div>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 14,
          }}
        >
          {clientName}
        </h2>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          Pegá el texto del brandbook nuevo, o subí un PDF para extracción
          automática. Si {clientName} ya tenía brand/ procesado, esa versión
          se archiva antes de generar la nueva. Tarda 30-60 segundos.
        </p>

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Subir PDF (extracción automática)
        </div>
        <input
          type="file"
          accept="application/pdf"
          onChange={handlePdfSelected}
          disabled={extracting || submitting}
          style={{ fontSize: 13, marginBottom: 8 }}
        />
        {progress && (
          <div
            style={{
              fontSize: 12,
              color: "var(--sand-dark)",
              marginBottom: 8,
            }}
          >
            {progress}
          </div>
        )}

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginTop: 16,
            marginBottom: 6,
          }}
        >
          Texto del brandbook
        </div>
        <textarea
          rows={12}
          value={brandbookText}
          onChange={(e) => setBrandbookText(e.target.value)}
          disabled={extracting || submitting}
          placeholder="Pegá el texto del brandbook (positioning, voz, paleta, restricciones…)"
          style={{
            width: "100%",
            fontFamily: "inherit",
            fontSize: 13,
            padding: 12,
            border: "1px solid rgba(10,26,12,0.15)",
            background: "var(--off-white)",
            resize: "vertical",
            lineHeight: 1.5,
          }}
        />
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 6,
          }}
        >
          {brandbookText.length === 0
            ? "Vacío"
            : brandbookText.length < 200
            ? `Muy corto (${brandbookText.length} chars · mínimo 200)`
            : `${brandbookText.length.toLocaleString("es-UY")} caracteres · listo`}
        </div>

        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginTop: 16,
            marginBottom: 6,
          }}
        >
          Link al PDF master (opcional)
        </div>
        <input
          type="url"
          value={brandbookUrl}
          onChange={(e) => setBrandbookUrl(e.target.value)}
          disabled={extracting || submitting}
          placeholder="https://drive.google.com/…"
          style={{
            width: "100%",
            fontFamily: "inherit",
            fontSize: 13,
            padding: "10px 12px",
            border: "1px solid rgba(10,26,12,0.15)",
            background: "var(--off-white)",
          }}
        />

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              background: "rgba(176,75,58,0.08)",
              borderLeft: "3px solid var(--red-warn)",
              color: "var(--red-warn)",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 24,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={extracting || submitting}
            style={{
              padding: "10px 20px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid rgba(10,26,12,0.15)",
              fontSize: 11,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: extracting || submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={extracting || submitting || brandbookText.length < 200}
            style={{
              padding: "10px 20px",
              background:
                brandbookText.length < 200
                  ? "var(--sand-dark)"
                  : "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              fontSize: 11,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor:
                extracting || submitting || brandbookText.length < 200
                  ? "not-allowed"
                  : "pointer",
              fontFamily: "inherit",
            }}
          >
            {submitting ? "Procesando…" : "↻ Re-procesar"}
          </button>
        </div>
      </div>
    </div>
  );
}
