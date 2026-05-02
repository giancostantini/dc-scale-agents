"use client";

import { useEffect, useState } from "react";
import { getDownloadUrl } from "@/lib/upload";

interface Props {
  open: boolean;
  path: string | null;
  name: string;
  onClose: () => void;
}

function inferKind(name: string): "pdf" | "image" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) {
    return "image";
  }
  return "other";
}

/**
 * Modal que carga un signed URL de Supabase Storage y muestra el archivo
 * inline cuando es PDF o imagen. Para otros formatos ofrece descarga.
 *
 * El padre debe pasar `key={path}` para forzar remount cuando cambia el
 * archivo a previsualizar — así los useState arrancan limpios sin
 * llamar setState dentro del body del effect.
 */
export default function AssetViewer({ open, path, name, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !path) return;
    let active = true;
    getDownloadUrl(path)
      .then((u) => {
        if (!active) return;
        if (!u) {
          setError(
            "No se pudo generar el link. ¿El archivo existe en el bucket?",
          );
        } else {
          setUrl(u);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message ?? "Error al cargar el archivo");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !path) return null;

  const kind = inferKind(name);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 26, 12, 0.85)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        padding: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          color: "var(--off-white)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--sand)",
              marginBottom: 4,
            }}
          >
            Vista previa
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={name}
          >
            {name}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "10px 16px",
                background: "var(--sand)",
                color: "var(--deep-green)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                textDecoration: "none",
              }}
            >
              Descargar ↓
            </a>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "10px 16px",
              background: "transparent",
              color: "var(--off-white)",
              border: "1px solid rgba(232, 228, 220, 0.3)",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cerrar ✕
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          background: "var(--off-white)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Cargando…
          </div>
        )}
        {error && (
          <div
            style={{
              color: "var(--red-warn)",
              padding: 24,
              textAlign: "center",
              maxWidth: 500,
            }}
          >
            {error}
          </div>
        )}
        {url && !loading && !error && kind === "pdf" && (
          <embed
            src={url}
            type="application/pdf"
            width="100%"
            height="100%"
            style={{ border: "none" }}
          />
        )}
        {url && !loading && !error && kind === "image" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={url}
            alt={name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        )}
        {url && !loading && !error && kind === "other" && (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              maxWidth: 500,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
                marginBottom: 16,
              }}
            >
              Este formato no se puede previsualizar inline.
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "12px 24px",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Descargar para ver
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
