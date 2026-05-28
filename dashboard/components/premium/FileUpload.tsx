"use client";

import { useRef, useState } from "react";
import { Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { getSupabase } from "@/lib/supabase/client";

/**
 * FileUpload premium para comprobantes/facturas.
 *
 * - Drop-zone con highlight on hover/drag
 * - Aceptos: PDF/JPG/PNG/WEBP/HEIC, max 10 MB
 * - Sube via /api/finanzas/upload-attachment
 * - Muestra preview con nombre + tamaño + botón borrar
 * - onChange devuelve la URL pública
 */

export interface FileUploadProps {
  /** Tipo de adjunto (income/expense), pasa al endpoint para organizar el path. */
  kind: "income" | "expense";
  /** URL actual del archivo. */
  value?: string | null;
  onChange: (url: string | null) => void;
  className?: string;
  disabled?: boolean;
}

export function FileUpload({
  kind,
  value,
  onChange,
  className,
  disabled,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (uploading || disabled) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo supera 10 MB");
      return;
    }
    setUploading(true);
    try {
      const supabase = getSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sin sesión");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);

      const res = await fetch("/api/finanzas/upload-attachment", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(" — "));
      }
      onChange(data.url);
      toast.success("Comprobante adjunto");
    } catch (err) {
      const e = err as Error;
      toast.error("No se pudo subir el archivo", {
        description: e.message,
      });
    } finally {
      setUploading(false);
    }
  }

  function onSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  // Si ya hay valor, mostrar preview
  if (value) {
    const isImage = /\.(png|jpe?g|webp|heic)$/i.test(value);
    const filename = value.split("/").pop() ?? "archivo";
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 bg-paper-100 border border-rule rounded-premium-sm",
          className,
        )}
      >
        <div className="w-9 h-9 bg-paper border border-rule rounded-premium-sm flex items-center justify-center text-ink-300">
          {isImage ? (
            <ImageIcon className="w-4 h-4" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-ink hover:text-accent-dim truncate block"
          >
            {filename}
          </a>
          <div className="text-2xs text-ink-300">Click para ver / descargar</div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-ink-300 hover:text-danger transition-colors p-1"
            aria-label="Quitar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
      className={cn(
        "border border-dashed rounded-premium px-4 py-6 text-center cursor-pointer transition-all",
        dragOver
          ? "border-accent bg-accent-tint"
          : "border-rule-strong hover:border-ink-300 hover:bg-paper-100",
        (disabled || uploading) && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <Paperclip className="w-5 h-5 text-ink-300 mx-auto mb-2" />
      <div className="text-sm font-medium text-ink mb-0.5">
        {uploading
          ? "Subiendo…"
          : dragOver
            ? "Soltá el archivo acá"
            : "Adjuntar comprobante"}
      </div>
      <div className="text-2xs text-ink-300">
        PDF, JPG, PNG · máximo 10 MB
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        onChange={onSelectFile}
        disabled={disabled || uploading}
        className="hidden"
      />
    </div>
  );
}
