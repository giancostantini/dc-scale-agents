"use client";

import { useRef, useState } from "react";
import { uploadFile, formatBytes, type UploadedFile } from "@/lib/upload";
import { compressPdfIfNeeded } from "@/lib/pdf-compress";
import { getSupabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";

interface Props {
  /** Cliente al que pertenece el archivo. */
  client: Client;
  /** Tipo de upload — define dónde se guarda en client.onboarding. */
  target: "kickoff" | "branding" | "contract";
  /** Texto del botón. Default: "+ Subir archivo". */
  label?: string;
  /** Atributo accept del input file. Default: PDF + imágenes. */
  accept?: string;
  /** Callback cuando termina la subida. Le pasa el file metadata final. */
  onUploaded?: (file: UploadedFile) => void;
}

/**
 * Botón de upload con auto-compresión:
 *  1. Click → file picker
 *  2. Si es PDF > 32 MB → comprime con barra de progreso
 *  3. Sube a Supabase Storage en la ruta del cliente
 *  4. Actualiza clients.onboarding (kickoffFile / brandingFiles / contractFile)
 *  5. Llama onUploaded para que el padre refresque
 *
 * Si algo falla, muestra error claro y deja el cliente sin tocar.
 */
export default function LibraryUploadButton({
  client,
  target,
  label = "+ Subir archivo",
  accept = ".pdf,.png,.jpg,.jpeg,.webp",
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string>("");

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    setProgress("");
    setProgressPct(0);

    try {
      // ====== 1. Comprimir si excede el threshold (solo PDFs) ======
      const finalFile = await compressPdfIfNeeded(file, (info) => {
        setProgress(info.message);
        setProgressPct(info.pct);
      });

      // ====== 2. Subir al bucket ======
      setProgress("Subiendo al bucket…");
      setProgressPct(95);

      const folder = `clients/${client.id}/${target}`;
      const uploaded = await uploadFile(finalFile, folder);

      // ====== 3. Actualizar onboarding del cliente ======
      setProgress("Actualizando cliente…");
      const supabase = getSupabase();

      const currentOnboarding = client.onboarding ?? {};
      let newOnboarding: typeof currentOnboarding;

      if (target === "kickoff") {
        newOnboarding = { ...currentOnboarding, kickoffFile: uploaded };
      } else if (target === "contract") {
        newOnboarding = { ...currentOnboarding, contractFile: uploaded };
      } else {
        // branding: append al array
        const current = Array.isArray(currentOnboarding.brandingFiles)
          ? currentOnboarding.brandingFiles
          : [];
        newOnboarding = {
          ...currentOnboarding,
          brandingFiles: [...current, uploaded],
        };
      }

      const { error: updateErr } = await supabase
        .from("clients")
        .update({ onboarding: newOnboarding })
        .eq("id", client.id);

      if (updateErr) {
        throw new Error(`Error actualizando cliente: ${updateErr.message}`);
      }

      setProgress("");
      setProgressPct(0);
      onUploaded?.(uploaded);
    } catch (err) {
      const e = err as Error;
      console.error("[LibraryUploadButton] error:", err);
      setError(e.message || "Error desconocido");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => !busy && inputRef.current?.click()}
        disabled={busy}
        style={{
          padding: "10px 18px",
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: busy ? "var(--text-muted)" : "var(--off-white)",
          background: busy ? "var(--off-white)" : "var(--deep-green)",
          border: "none",
          cursor: busy ? "wait" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {busy ? "Procesando…" : label}
      </button>

      {busy && progress && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "10px 14px",
            background: "var(--off-white)",
            borderLeft: "3px solid var(--sand)",
            minWidth: 280,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--deep-green)", fontWeight: 500 }}>
            {progress}
          </div>
          {progressPct > 0 && progressPct < 100 && (
            <div
              style={{
                width: "100%",
                height: 4,
                background: "var(--ivory)",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${progressPct}%`,
                  height: "100%",
                  background: "var(--sand)",
                  transition: "width 0.2s",
                }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(176,75,58,0.08)",
            borderLeft: "3px solid var(--red-warn)",
            fontSize: 11,
            color: "var(--red-warn)",
            maxWidth: 360,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {!busy && !error && file_size_hint(target)}
    </div>
  );
}

function file_size_hint(target: "kickoff" | "branding" | "contract") {
  const hint =
    target === "kickoff"
      ? "PDF · si pesa más de 32 MB se comprime automático"
      : target === "branding"
      ? "PDF o imagen · multiple uploads sumando al manual"
      : "PDF firmado";
  return (
    <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
      ↑ {hint}
    </div>
  );
}
