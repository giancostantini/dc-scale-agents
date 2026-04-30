"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  uploadAsset,
  deleteAsset,
  CATEGORY_ACCEPT,
  SUBCATEGORY_LABELS,
  slugifyFontFamily,
  type AssetCategory,
} from "@/lib/asset-upload";

interface AssetEntry {
  filename: string;
  size?: number;
  path: string;
}

interface CategoryUploaderProps {
  clientId: string;
  category: AssetCategory;
  /** Sub-categorías fijas (para mascot, ilustraciones). null para flat o
   *  para tipografías (que tiene sub-categorías dinámicas). */
  fixedSubcategories: string[] | null;
  /** Archivos por sub-categoría. "_root" para categorías flat. */
  subcategoryFiles: Record<string, AssetEntry[]>;
  description: string;
  onChanged: () => void;
  onToast: (msg: string) => void;
}

/**
 * Uploader unificado por categoría. Soporta 3 modos:
 *  - flat (logo, curvas, key-visuals, brand-book): un solo dropzone
 *  - sub-categorías fijas (mascot, ilustraciones): un dropzone por sub
 *  - sub-categorías dinámicas (tipografias): el usuario crea folders por
 *    font family con un input + botón
 */
export default function CategoryUploader({
  clientId,
  category,
  fixedSubcategories,
  subcategoryFiles,
  description,
  onChanged,
  onToast,
}: CategoryUploaderProps) {
  const accept = CATEGORY_ACCEPT[category];

  const isDynamicSub = category === "tipografias";
  const isFlat = !fixedSubcategories && !isDynamicSub;

  // Sub-categorías a renderizar
  let subsToShow: string[];
  if (fixedSubcategories) {
    subsToShow = fixedSubcategories;
  } else if (isDynamicSub) {
    // Sub-folders existentes en tipografias + permitir agregar uno nuevo
    subsToShow = Object.keys(subcategoryFiles).sort();
  } else {
    subsToShow = ["_root"];
  }

  // Estado para crear sub-folder dinámico (tipografias)
  const [newSubName, setNewSubName] = useState("");
  const [pendingSubs, setPendingSubs] = useState<string[]>([]);

  function addPendingSub() {
    const name = newSubName.trim();
    if (!name) return;
    const slug = slugifyFontFamily(name);
    if (!slug) return;
    if (subsToShow.includes(slug) || pendingSubs.includes(slug)) {
      onToast(`La font "${name}" ya está agregada.`);
      return;
    }
    setPendingSubs((prev) => [...prev, slug]);
    setNewSubName("");
  }

  // En tipografias mostramos los subFolders existentes + los pendientes
  // (que aún no tienen archivos pero están listos para upload)
  const tipografiasSubs = isDynamicSub
    ? [...subsToShow, ...pendingSubs.filter((p) => !subsToShow.includes(p))]
    : subsToShow;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Descripción de la categoría */}
      <div
        style={{
          padding: "12px 18px",
          background: "var(--off-white)",
          borderLeft: "3px solid var(--sand)",
          fontSize: 13,
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>

      {/* Para tipografias: input para crear sub-folder nuevo */}
      {isDynamicSub && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "12px 16px",
            background: "rgba(58,139,92,0.04)",
            border: "1px solid rgba(58,139,92,0.2)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Agregar font family:
          </span>
          <input
            type="text"
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPendingSub()}
            placeholder="ej: Bricolage Grotesque"
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid rgba(10,26,12,0.15)",
              background: "var(--white)",
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onClick={addPendingSub}
            disabled={!newSubName.trim()}
            style={{
              padding: "6px 14px",
              background: newSubName.trim()
                ? "var(--deep-green)"
                : "var(--sand-dark)",
              color: "var(--off-white)",
              border: "none",
              fontSize: 11,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 600,
              cursor: newSubName.trim() ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            + Agregar
          </button>
        </div>
      )}

      {/* Render de sub-categorías */}
      {(isDynamicSub ? tipografiasSubs : subsToShow).length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--text-muted)",
            border: "1px dashed rgba(10,26,12,0.15)",
            fontSize: 13,
          }}
        >
          {isDynamicSub
            ? "Todavía no agregaste ninguna font family. Usá el input de arriba."
            : "Sin archivos cargados."}
        </div>
      ) : (
        <>
          {(isDynamicSub ? tipografiasSubs : subsToShow).map((sub) => {
            const files = subcategoryFiles[sub] ?? [];
            const subLabel = isFlat
              ? null
              : isDynamicSub
                ? sub
                    .split("-")
                    .map(
                      (p) => p.charAt(0).toUpperCase() + p.slice(1),
                    )
                    .join(" ")
                : (SUBCATEGORY_LABELS[sub] ?? sub);

            return (
              <SubcategoryDropzone
                key={sub}
                clientId={clientId}
                category={category}
                subCategory={isFlat ? null : sub}
                label={subLabel}
                accept={accept}
                files={files}
                onUploaded={() => onChanged()}
                onDeleted={() => onChanged()}
                onToast={onToast}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

// ============================================================
// SubcategoryDropzone — drag-drop multi-file para una sub-categoría
// ============================================================

interface SubcategoryDropzoneProps {
  clientId: string;
  category: AssetCategory;
  subCategory: string | null;
  label: string | null;
  accept: string;
  files: AssetEntry[];
  onUploaded: () => void;
  onDeleted: () => void;
  onToast: (msg: string) => void;
}

function SubcategoryDropzone({
  clientId,
  category,
  subCategory,
  label,
  accept,
  files,
  onUploaded,
  onDeleted,
  onToast,
}: SubcategoryDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      // brand-book es 1 solo archivo — limitamos a 1
      const arr =
        category === "brand-book"
          ? Array.from(list).slice(0, 1)
          : Array.from(list);
      let okCount = 0;
      for (const file of arr) {
        try {
          await uploadAsset(clientId, category, subCategory, file);
          okCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "upload failed";
          onToast(`Error subiendo ${file.name}: ${msg}`);
        }
      }
      if (okCount > 0) {
        onToast(`✓ ${okCount} archivo(s) subido(s)`);
        onUploaded();
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(entry: AssetEntry) {
    if (!confirm(`¿Borrar ${entry.filename}?`)) return;
    try {
      await deleteAsset(entry.path);
      onToast(`✓ ${entry.filename} borrado`);
      onDeleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "delete failed";
      onToast(`Error: ${msg}`);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div>
      {label && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          {label} ({files.length})
        </div>
      )}

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
          padding: 20,
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          marginBottom: files.length > 0 ? 10 : 0,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={category !== "brand-book"}
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
          {uploading
            ? "Subiendo…"
            : files.length > 0
              ? `+ Agregar más`
              : "Arrastrá archivos o hacé click"}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {accept.replace(/image\//g, ".").replace(/,/g, " · ")}
          {category === "brand-book" && " · solo 1 archivo (re-upload reemplaza)"}
        </div>
      </div>

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
                  wordBreak: "break-all",
                }}
              >
                {file.filename}
              </span>
              {file.size !== undefined && file.size > 0 && (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 10,
                    whiteSpace: "nowrap",
                  }}
                >
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(file);
                }}
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
