"use client";

import { useRef, useState, type DragEvent } from "react";
import { uploadFile, formatBytes, type UploadedFile } from "@/lib/upload";

interface DropzoneProps {
  /** Folder dentro del bucket donde se guardan los archivos. */
  folder: string;
  /** Acepta múltiples archivos en un solo drop. */
  multiple?: boolean;
  /** Atributo `accept` del input nativo (.pdf, image/*, etc). */
  accept?: string;
  /** Texto principal cuando está vacío. */
  emptyTitle?: string;
  /** Texto secundario cuando está vacío. */
  emptyHint?: string;
  /** Icono ASCII / unicode visual. */
  icon?: string;
  /** Archivos ya subidos (controlado por el padre). */
  files: UploadedFile[];
  /** Callback cuando se agrega(n) archivo(s). */
  onAdd: (files: UploadedFile[]) => void;
  /** Callback opcional para quitar un archivo (mostrar la x). */
  onRemove?: (path: string) => void;
}

export default function Dropzone({
  folder,
  multiple = false,
  accept,
  emptyTitle = "Arrastrá el archivo o hacé click",
  emptyHint = "PDF, ZIP, imágenes",
  icon = "▢",
  files,
  onAdd,
  onRemove,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>("");

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError("");
    setUploading(true);
    try {
      const arr = Array.from(list);
      const filesToUpload = multiple ? arr : arr.slice(0, 1);
      const results: UploadedFile[] = [];
      for (const f of filesToUpload) {
        const uploaded = await uploadFile(f, folder);
        results.push(uploaded);
      }
      onAdd(results);
    } catch (err) {
      const e = err as { message?: string; statusCode?: string };
      console.error("upload error:", err);
      setError(
        e.message ??
          "No se pudo subir el archivo. Verificá que el bucket 'client-onboarding' exista en Supabase Storage.",
      );
    } finally {
      setUploading(false);
      // limpiar el input para permitir re-seleccionar el mismo archivo
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  const hasFiles = files.length > 0;

  return (
    <div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: `2px dashed ${
            dragOver
              ? "var(--sand)"
              : hasFiles
              ? "var(--green-ok)"
              : "rgba(10,26,12,0.15)"
          }`,
          background: dragOver
            ? "var(--off-white)"
            : hasFiles
            ? "rgba(58,139,92,0.04)"
            : "transparent",
          padding: 24,
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          transition: "all 0.15s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div
          style={{
            fontSize: 28,
            color: hasFiles ? "var(--green-ok)" : "var(--sand-dark)",
            marginBottom: 8,
          }}
        >
          {uploading ? "↑" : hasFiles ? "✓" : icon}
        </div>
        {uploading ? (
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--sand-dark)" }}>
            Subiendo…
          </div>
        ) : hasFiles ? (
          <>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--deep-green)",
              }}
            >
              {multiple
                ? `✓ ${files.length} archivo${files.length === 1 ? "" : "s"} cargado${files.length === 1 ? "" : "s"}`
                : `✓ ${files[0].name}`}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--sand-dark)",
                marginTop: 4,
              }}
            >
              {multiple
                ? "Click o arrastrá más para agregar"
                : `${formatBytes(files[0].size)} · click para reemplazar`}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{emptyTitle}</div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              {emptyHint}
            </div>
          </>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 14px",
            background: "rgba(176,75,58,0.1)",
            borderLeft: "3px solid var(--red-warn)",
            color: "var(--red-warn)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Lista de archivos cuando hay múltiples */}
      {multiple && files.length > 0 && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {files.map((f) => (
            <div
              key={f.path}
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
              <span style={{ flex: 1, color: "var(--deep-green)" }}>
                {f.name}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {formatBytes(f.size)}
              </span>
              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(f.path);
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    border: "1px solid rgba(176,75,58,0.2)",
                    background: "transparent",
                    color: "var(--red-warn)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "inherit",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
