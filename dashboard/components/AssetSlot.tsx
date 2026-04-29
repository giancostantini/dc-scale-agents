"use client";

import { useRef, useState } from "react";

interface AssetSlotProps {
  canonicalName: string;
  label: string;
  fileName: string | null;
  accept?: string;
  /** Si true, render más compacto (para grids densos como mascot 8×3). */
  compact?: boolean;
  onUpload: (file: File) => Promise<void> | void;
  onDelete?: () => void;
}

export default function AssetSlot({
  canonicalName,
  label,
  fileName,
  accept,
  compact = false,
  onUpload,
  onDelete,
}: AssetSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const filled = !!fileName;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      style={{
        border: `1.5px ${filled ? "solid" : "dashed"} ${
          filled ? "var(--green-ok)" : "rgba(10,26,12,0.15)"
        }`,
        background: filled ? "rgba(58,139,92,0.04)" : "transparent",
        padding: compact ? 10 : 14,
        cursor: uploading ? "wait" : "pointer",
        transition: "all 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 4 : 6,
        minHeight: compact ? 70 : 90,
      }}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div
        style={{
          fontSize: compact ? 9 : 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: compact ? 10 : 11,
          fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
          color: filled ? "var(--green-ok)" : "var(--text-muted)",
          wordBreak: "break-all",
          lineHeight: 1.3,
        }}
      >
        {uploading
          ? "Subiendo…"
          : filled
            ? `✓ ${fileName}`
            : compact
              ? "Click ↑"
              : "Click para subir"}
      </div>

      {filled && !uploading && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginTop: "auto",
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            style={{
              fontSize: 9,
              padding: "3px 6px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid rgba(10,26,12,0.15)",
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Reemplazar
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{
                fontSize: 9,
                padding: "3px 6px",
                background: "transparent",
                color: "var(--red-warn)",
                border: "1px solid rgba(176,75,58,0.3)",
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              ×
            </button>
          )}
        </div>
      )}

      {!filled && (
        <div
          style={{
            fontSize: 9,
            color: "var(--sand-dark)",
            marginTop: "auto",
            fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
            opacity: 0.6,
          }}
        >
          {canonicalName}
        </div>
      )}
    </div>
  );
}
