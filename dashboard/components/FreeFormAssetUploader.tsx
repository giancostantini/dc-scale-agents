"use client";

import { useRef, useState, type DragEvent } from "react";
import { getSupabase } from "@/lib/supabase/client";

interface AssetFile {
  name: string;
  size?: number;
  path: string;
}

interface FreeFormAssetUploaderProps {
  clientId: string;
  category: "patterns" | "inspiration";
  files: AssetFile[];
  onUploaded: (file: AssetFile) => void;
  onDeleted: (name: string) => void;
}

/**
 * Uploader para categorías "patterns" e "inspiration" que NO tienen slots
 * predefinidos. Drag-drop multi-file. El usuario puede dar nombre custom
 * antes de subir; si no, usa el filename original sanitizado.
 */
export default function FreeFormAssetUploader({
  clientId,
  category,
  files,
  onUploaded,
  onDeleted,
}: FreeFormAssetUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function sanitize(name: string): string {
    // Saca extensión, sanea, agrega extensión nuevamente
    const m = name.match(/^(.+)\.([a-zA-Z0-9]+)$/);
    const base = (m ? m[1] : name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const ext = m ? m[2].toLowerCase() : "bin";
    return `${base || "asset"}.${ext}`;
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setUploading(true);

    const supabase = getSupabase();
    try {
      for (const file of Array.from(list)) {
        const sanitized = sanitize(file.name);
        const path = `${clientId}/${category}/${sanitized}`;
        const { error: upErr } = await supabase.storage
          .from("client-assets")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) {
          setError(upErr.message);
          continue;
        }
        onUploaded({ name: sanitized, size: file.size, path });
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(file: AssetFile) {
    if (!confirm(`¿Borrar ${file.name}?`)) return;
    const supabase = getSupabase();
    const { error: delErr } = await supabase.storage
      .from("client-assets")
      .remove([file.path]);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    onDeleted(file.name);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        style={{
          border: `2px dashed ${
            dragOver
              ? "var(--sand)"
              : files.length > 0
                ? "var(--green-ok)"
                : "rgba(10,26,12,0.15)"
          }`,
          background: dragOver
            ? "var(--off-white)"
            : files.length > 0
              ? "rgba(58,139,92,0.04)"
              : "transparent",
          padding: 32,
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          marginBottom: 14,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.svg"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
          {uploading
            ? "Subiendo…"
            : files.length > 0
              ? `✓ ${files.length} archivo(s) cargado(s)`
              : "Arrastrá archivos o hacé click"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          PNG · JPG · SVG · multi-file · click para agregar más
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(176,75,58,0.08)",
            borderLeft: "3px solid var(--red-warn)",
            color: "var(--red-warn)",
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((file) => (
            <div
              key={file.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: "var(--off-white)",
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--green-ok)" }}>✓</span>
              <span
                style={{
                  flex: 1,
                  fontFamily:
                    '"SF Mono", Menlo, Monaco, Consolas, monospace',
                  fontSize: 11,
                  color: "var(--deep-green)",
                }}
              >
                {file.name}
              </span>
              {file.size && (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 10,
                  }}
                >
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              )}
              <button
                type="button"
                onClick={() => handleDelete(file)}
                style={{
                  width: 20,
                  height: 20,
                  border: "1px solid rgba(176,75,58,0.2)",
                  background: "transparent",
                  color: "var(--red-warn)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
