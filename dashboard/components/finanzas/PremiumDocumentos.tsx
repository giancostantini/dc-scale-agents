"use client";

/**
 * PremiumDocumentos — gestión centralizada de documentos contables.
 *
 * Matchea el mockup:
 *   Header: título + search + Filtros + "+ Subir Documento"
 *   Row 1: 5 KPI cards (Totales · Almacenamiento · Mes · Pendientes
 *          de Clasificar · Compartidos) con delta vs mes anterior
 *   Row 2 (2/3 + 1/3):
 *     - Grid de Carpetas (8 cards: facturas venta/compra, recibos,
 *       contratos, balances, liquidaciones, impuestos, otros)
 *     - "Actividad Reciente" (últimos 5 docs subidos)
 *   Row 3: tabla "Todos los Documentos" con search + filtros +
 *          export + paginación
 */

import { useEffect, useMemo, useState } from "react";
import {
  FileText, Folder, Cloud, Calendar, Tag, Share2,
  Search, Plus, Filter, Eye, Download, Trash2, Upload,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteDocument,
  formatBytes,
  FOLDER_LABEL,
  getDocumentDownloadUrl,
  listDocuments,
  uploadDocument,
  type DocumentFolder,
  type FinanzasDocument,
} from "@/lib/finanzas-documents";
import { Button } from "@/components/premium/Button";
import { Modal } from "@/components/premium/Modal";
import { Field, Input, Select } from "@/components/premium/Field";
import { cn } from "@/lib/cn";

// Quota visual (Supabase storage no impone esto desde DB — para mockup)
const STORAGE_QUOTA_GB = 50;

const FOLDER_ICON_COLOR: Record<DocumentFolder, { bg: string; text: string }> = {
  facturas_venta:  { bg: "bg-blue-50",    text: "text-blue-600" },
  facturas_compra: { bg: "bg-indigo-50",  text: "text-indigo-600" },
  recibos:         { bg: "bg-emerald-50", text: "text-emerald-600" },
  contratos:       { bg: "bg-amber-50",   text: "text-amber-600" },
  balances:        { bg: "bg-violet-50",  text: "text-violet-600" },
  liquidaciones:   { bg: "bg-orange-50",  text: "text-orange-600" },
  impuestos:       { bg: "bg-rose-50",    text: "text-rose-600" },
  otros:           { bg: "bg-slate-100",  text: "text-slate-600" },
};

const TYPE_PILL_COLORS: Record<string, string> = {
  factura:     "bg-blue-100 text-blue-800",
  recibo:      "bg-emerald-100 text-emerald-800",
  contrato:    "bg-amber-100 text-amber-800",
  balance:     "bg-violet-100 text-violet-800",
  liquidacion: "bg-orange-100 text-orange-800",
  impuesto:    "bg-rose-100 text-rose-800",
  otro:        "bg-slate-100 text-slate-700",
  informe:     "bg-cyan-100 text-cyan-800",
};

function inferType(doc: FinanzasDocument): string {
  if (doc.doc_type) return doc.doc_type.toLowerCase();
  // Inferir desde folder/file_name
  const f = doc.folder;
  if (f.startsWith("facturas")) return "factura";
  if (f === "recibos") return "recibo";
  if (f === "contratos") return "contrato";
  if (f === "balances") return "balance";
  if (f === "liquidaciones") return "liquidacion";
  if (f === "impuestos") return "impuesto";
  return "otro";
}

/**
 * Heurística para clasificar automáticamente un archivo según su
 * nombre. Se evalúa cuando el director elige un archivo en el modal
 * de subida — el dropdown queda preseleccionado en la carpeta
 * detectada y se puede cambiar manualmente si la detección falla.
 *
 * Reglas (más específicas primero):
 *   - "factura_venta", "fac_venta", "fv-", "fact_emit" → facturas_venta
 *   - "factura_compra", "fc-", "proveedor", "compra" → facturas_compra
 *   - "factura", "fac", "comp"                        → facturas_venta (default)
 *   - "recibo", "rec_", "remito"                      → recibos
 *   - "contrato", "contract", "agreement", "acuerdo"  → contratos
 *   - "balance", "estado_financiero", "ebitda"        → balances
 *   - "liquidacion", "sueldo", "haber", "nomina"      → liquidaciones
 *   - "iva", "iibb", "ganancias", "impuesto", "afip", "dgi", "bps", "irpf" → impuestos
 *   - resto → otros
 */
export function detectFolderFromFilename(name: string): DocumentFolder {
  const n = name.toLowerCase();
  // facturas_venta (más específico antes que "factura")
  if (
    n.includes("factura_venta") ||
    n.includes("factura-venta") ||
    n.includes("fac_venta") ||
    n.includes("fv-") ||
    n.includes("fv_") ||
    n.includes("fact_emit") ||
    n.includes("emitida")
  )
    return "facturas_venta";
  // facturas_compra
  if (
    n.includes("factura_compra") ||
    n.includes("factura-compra") ||
    n.includes("fac_compra") ||
    n.includes("fc-") ||
    n.includes("fc_") ||
    n.includes("proveedor") ||
    n.includes("/compra") ||
    n.includes("compra_")
  )
    return "facturas_compra";
  // factura genérica → venta (lo más común para una agencia)
  if (n.includes("factura") || n.startsWith("fac") || n.includes("invoice")) {
    return "facturas_venta";
  }
  // recibos
  if (n.includes("recibo") || n.includes("rec_") || n.includes("remito") || n.includes("receipt")) {
    return "recibos";
  }
  // contratos
  if (
    n.includes("contrato") ||
    n.includes("contract") ||
    n.includes("agreement") ||
    n.includes("acuerdo") ||
    n.includes("nda") ||
    n.includes("propuesta")
  )
    return "contratos";
  // balances / estados
  if (
    n.includes("balance") ||
    n.includes("estado_financiero") ||
    n.includes("estado-financiero") ||
    n.includes("ebitda") ||
    n.includes("pyl") ||
    n.includes("p&l") ||
    n.includes("cashflow") ||
    n.includes("cierre_anual")
  )
    return "balances";
  // liquidaciones (sueldos)
  if (
    n.includes("liquidacion") ||
    n.includes("liquidación") ||
    n.includes("sueldo") ||
    n.includes("haber") ||
    n.includes("nomina") ||
    n.includes("nómina") ||
    n.includes("payroll") ||
    n.includes("salario")
  )
    return "liquidaciones";
  // impuestos
  if (
    n.includes("iva") ||
    n.includes("iibb") ||
    n.includes("ganancia") ||
    n.includes("impuesto") ||
    n.includes("afip") ||
    n.includes("dgi") ||
    n.includes("bps") ||
    n.includes("irpf") ||
    n.includes("tax") ||
    n.includes("monotrib")
  )
    return "impuestos";
  return "otros";
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (diffMin < 1) return "Recién";
  if (diffH < 1) return `Hace ${diffMin} min`;
  if (diffH < 24 && d.getDate() === now.getDate()) return `Hoy, ${timeStr}`;
  if (diffDays === 1) return `Ayer, ${timeStr}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${timeStr}`;
}

export function PremiumDocumentos() {
  const [docs, setDocs] = useState<FinanzasDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<"all" | DocumentFolder>("all");
  const [page, setPage] = useState(0);
  const pageSize = 8;

  const [uploadModal, setUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFolder, setUploadFolder] = useState<DocumentFolder>("facturas_venta");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  function refresh() {
    setLoading(true);
    listDocuments().then((d) => {
      setDocs(d);
      setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  // ===== Stats =====
  const totalCount = docs.length;
  const totalSize = docs.reduce((s, d) => s + d.size_bytes, 0);
  const totalGB = totalSize / 1024 / 1024 / 1024;
  const usagePct = (totalGB / STORAGE_QUOTA_GB) * 100;

  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 7);

  const docsCurMonth = docs.filter((d) => d.created_at?.slice(0, 7) === curMonth);
  const docsPrevMonth = docs.filter((d) => d.created_at?.slice(0, 7) === prevMonth);

  const pendingCount = docs.filter((d) => d.pending_review).length;
  const pendingPrev = 0; // No tenemos histórico — placeholder
  const sharedCount = docs.filter((d) => d.shared).length;
  const sharedPrev = 0;

  function pct(a: number, b: number): number | null {
    if (b === 0) return a === 0 ? 0 : null;
    return ((a - b) / Math.abs(b)) * 100;
  }

  // ===== Carpetas con count =====
  const folderCounts = useMemo(() => {
    const counts: Record<DocumentFolder, number> = {
      facturas_venta: 0,
      facturas_compra: 0,
      recibos: 0,
      contratos: 0,
      balances: 0,
      liquidaciones: 0,
      impuestos: 0,
      otros: 0,
    };
    for (const d of docs) {
      counts[d.folder] = (counts[d.folder] ?? 0) + 1;
    }
    return counts;
  }, [docs]);

  // ===== Recientes (top 5) =====
  const recientes = useMemo(() => {
    return [...docs]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5);
  }, [docs]);

  // ===== Lista filtrada + paginada =====
  const filteredList = docs
    .filter((d) => {
      if (folderFilter !== "all" && d.folder !== folderFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          d.file_name.toLowerCase().includes(q) ||
          (d.uploaded_by_name ?? "").toLowerCase().includes(q) ||
          (d.notes ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filteredList.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // ===== Acciones =====
  async function handleUpload() {
    if (!uploadFile) {
      toast.error("Elegí un archivo");
      return;
    }
    setUploading(true);
    try {
      await uploadDocument({
        file: uploadFile,
        folder: uploadFolder,
        notes: uploadNotes.trim() || undefined,
      });
      toast.success(`"${uploadFile.name}" subido correctamente`);
      setUploadModal(false);
      setUploadFile(null);
      setUploadNotes("");
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc: FinanzasDocument) {
    try {
      const url = await getDocumentDownloadUrl(doc);
      // Abrir en nueva tab
      window.open(url, "_blank");
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  async function handleDelete(doc: FinanzasDocument) {
    if (!confirm(`¿Eliminar "${doc.file_name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteDocument(doc);
      toast.success("Documento eliminado");
      refresh();
    } catch (err) {
      const e = err as Error;
      toast.error(`Error: ${e.message}`);
    }
  }

  function exportCsv() {
    const header = ["Nombre", "Carpeta", "Tipo", "Subido por", "Fecha", "Tamaño"];
    const rows = filteredList.map((d) =>
      [
        d.file_name,
        FOLDER_LABEL[d.folder],
        inferType(d),
        d.uploaded_by_name ?? "—",
        formatDateShort(d.created_at),
        formatBytes(d.size_bytes),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "﻿" + [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `documentos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">
            Documentos
          </h1>
          <p className="text-sm text-ink-300 mt-1">
            Centralizá, organizá y gestioná todos los documentos de tu empresa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Buscar documentos…"
              className="pl-8 pr-12 h-8 w-64 text-xs bg-paper border border-rule rounded-premium-sm placeholder-ink-300 focus:outline-none focus:border-ink-300 transition-colors"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-300 bg-paper-100 border border-rule rounded px-1.5 py-0.5 font-mono">
              ⌘K
            </kbd>
          </div>
          <button
            className="inline-flex items-center gap-1.5 px-3 h-8 text-xs text-ink-500 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
          </button>
          <Button variant="primary" size="md" onClick={() => setUploadModal(true)}>
            <Plus className="w-4 h-4" />
            Subir Documento
          </Button>
        </div>
      </div>

      {/* ===== Row 1: KPIs ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <DocKpiCard
          label="Documentos Totales"
          value={totalCount.toLocaleString("es-AR")}
          delta={pct(docsCurMonth.length, docsPrevMonth.length)}
          icon={<FileText className="w-4 h-4" />}
          loading={loading}
        />
        <DocKpiCard
          label="Almacenamiento"
          value={`${totalGB.toFixed(2)} GB`}
          subValue={`de ${STORAGE_QUOTA_GB} GB`}
          progress={usagePct}
          icon={<Cloud className="w-4 h-4" />}
          loading={loading}
        />
        <DocKpiCard
          label="Documentos este Mes"
          value={String(docsCurMonth.length)}
          delta={pct(docsCurMonth.length, docsPrevMonth.length)}
          icon={<Calendar className="w-4 h-4" />}
          loading={loading}
        />
        <DocKpiCard
          label="Pendientes de Clasificar"
          value={String(pendingCount)}
          delta={pct(pendingCount, pendingPrev)}
          icon={<Tag className="w-4 h-4" />}
          loading={loading}
        />
        <DocKpiCard
          label="Compartidos"
          value={String(sharedCount)}
          delta={pct(sharedCount, sharedPrev)}
          icon={<Share2 className="w-4 h-4" />}
          loading={loading}
        />
      </div>

      {/* ===== Row 2: Carpetas + Actividad Reciente ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Carpetas (col-span-2) */}
        <div className="lg:col-span-2 bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">Carpetas</div>
            <button className="text-xs text-info hover:underline">Ver todas</button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(Object.keys(FOLDER_LABEL) as DocumentFolder[]).map((f) => {
                const colors = FOLDER_ICON_COLOR[f];
                return (
                  <button
                    key={f}
                    onClick={() => {
                      setFolderFilter(f);
                      setPage(0);
                    }}
                    className="group bg-paper border border-rule rounded-premium p-4 hover:border-rule-strong hover:shadow-premium-sm transition-all text-left"
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-premium-sm flex items-center justify-center mb-3",
                        colors.bg,
                        colors.text,
                      )}
                    >
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-medium text-ink truncate">
                      {FOLDER_LABEL[f]}
                    </div>
                    <div className="text-xs text-ink-300 mt-0.5">
                      {folderCounts[f]} documentos
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actividad Reciente */}
        <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="font-semibold text-ink text-md">Actividad Reciente</div>
            <button className="text-xs text-info hover:underline">Ver todas</button>
          </div>
          <div className="p-4">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="py-2.5 border-b border-rule-soft last:border-0">
                  <div className="skeleton h-3.5 w-3/4 mb-1.5" />
                  <div className="skeleton h-2.5 w-1/2" />
                </div>
              ))
            ) : recientes.length === 0 ? (
              <div className="py-10 text-center text-ink-300 italic text-xs">
                Sin actividad reciente.
              </div>
            ) : (
              recientes.map((d) => {
                const type = inferType(d);
                const pillClass = TYPE_PILL_COLORS[type] ?? "bg-slate-100 text-slate-700";
                return (
                  <button
                    key={d.id}
                    onClick={() => handleDownload(d)}
                    className="w-full flex items-start gap-2.5 py-2.5 border-b border-rule-soft last:border-0 hover:bg-paper-100 -mx-1 px-1 rounded transition-colors text-left"
                  >
                    <div className={cn("shrink-0 w-7 h-7 rounded-premium-sm flex items-center justify-center", FOLDER_ICON_COLOR[d.folder].bg, FOLDER_ICON_COLOR[d.folder].text)}>
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-ink truncate">
                        {d.file_name}
                      </div>
                      <div className="text-2xs text-ink-300 mt-0.5">
                        Subido por {d.uploaded_by_name ?? "—"}
                      </div>
                    </div>
                    <div className="text-2xs text-ink-300 shrink-0 whitespace-nowrap">
                      {relativeTime(d.created_at)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ===== Row 3: Tabla ===== */}
      <div className="bg-paper border border-rule rounded-premium shadow-premium-xs">
        <div className="px-5 py-4 border-b border-rule flex items-center justify-between gap-3 flex-wrap">
          <div className="font-semibold text-ink text-md">Todos los Documentos</div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Buscar en documentos…"
                className="pl-8 pr-3 h-8 w-56 text-xs bg-paper-100 border border-rule rounded-premium-sm placeholder-ink-300 focus:outline-none focus:border-ink-300 focus:bg-paper transition-colors"
              />
            </div>
            <select
              value={folderFilter}
              onChange={(e) => { setFolderFilter(e.target.value as typeof folderFilter); setPage(0); }}
              className="h-8 px-2.5 text-xs bg-paper border border-rule rounded-premium-sm cursor-pointer focus:outline-none focus:border-ink-300"
            >
              <option value="all">Todas las carpetas</option>
              {(Object.keys(FOLDER_LABEL) as DocumentFolder[]).map((f) => (
                <option key={f} value={f}>{FOLDER_LABEL[f]}</option>
              ))}
            </select>
            <button
              onClick={exportCsv}
              className="inline-flex items-center justify-center w-8 h-8 text-ink-400 bg-paper border border-rule rounded-premium-sm hover:border-rule-strong hover:text-ink transition-colors"
              title="Exportar CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-100/60 border-b border-rule">
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">↑ Nombre</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Carpeta</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Tipo</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Subido por</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Fecha</th>
                <th className="text-left px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Tamaño</th>
                <th className="text-right px-4 py-3 text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-rule-soft">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="skeleton h-3.5 w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-ink-300 italic">
                    Sin documentos cargados.
                  </td>
                </tr>
              ) : (
                paged.map((d) => {
                  const type = inferType(d);
                  const pillClass = TYPE_PILL_COLORS[type] ?? "bg-slate-100 text-slate-700";
                  return (
                    <tr key={d.id} className="border-b border-rule-soft hover:bg-paper-100">
                      <td className="px-4 py-3 text-ink font-medium flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-ink-300 shrink-0" />
                        <span className="truncate max-w-xs">{d.file_name}</span>
                      </td>
                      <td className="px-4 py-3 text-ink-400">{FOLDER_LABEL[d.folder]}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2.5 py-0.5 text-2xs font-semibold rounded-full", pillClass)}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-400">{d.uploaded_by_name ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-400 tabular-nums">{formatDateShort(d.created_at)}</td>
                      <td className="px-4 py-3 text-ink-400 tabular-nums">{formatBytes(d.size_bytes)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleDownload(d)}
                            className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                            title="Ver"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDownload(d)}
                            className="p-1.5 rounded-premium-sm text-ink-400 hover:text-ink hover:bg-paper-200 transition-colors"
                            title="Descargar"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(d)}
                            className="p-1.5 rounded-premium-sm text-ink-400 hover:text-danger hover:bg-danger/10 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-rule flex items-center justify-between">
          <div className="text-xs text-ink-300">
            Mostrando {filteredList.length === 0 ? 0 : safePage * pageSize + 1} a{" "}
            {Math.min((safePage + 1) * pageSize, filteredList.length)} de{" "}
            {filteredList.length} documentos
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="px-2.5 h-7 text-xs text-ink-400 disabled:opacity-40 hover:text-ink transition-colors"
            >
              ‹ Anterior
            </button>
            {Array.from({ length: Math.min(totalPages, 3) }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={cn(
                  "min-w-7 h-7 text-xs rounded-premium-sm transition-colors px-2",
                  safePage === i
                    ? "bg-ink text-paper font-semibold"
                    : "text-ink-400 hover:bg-paper-200",
                )}
              >
                {i + 1}
              </button>
            ))}
            {totalPages > 3 && (
              <>
                <span className="text-ink-300 text-xs px-1">…</span>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  className={cn(
                    "min-w-7 h-7 text-xs rounded-premium-sm transition-colors px-2",
                    safePage === totalPages - 1
                      ? "bg-ink text-paper font-semibold"
                      : "text-ink-400 hover:bg-paper-200",
                  )}
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="px-2.5 h-7 text-xs text-ink-400 disabled:opacity-40 hover:text-ink transition-colors"
            >
              Siguiente ›
            </button>
          </div>
        </div>
      </div>

      {/* Modal Upload */}
      <Modal
        open={uploadModal}
        onClose={() => !uploading && setUploadModal(false)}
        title="Subir documento"
        description="Centralizá tus comprobantes, contratos y reportes."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUploadModal(false)} disabled={uploading}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleUpload} loading={uploading} disabled={!uploadFile}>
              <Upload className="w-4 h-4" />
              Subir
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Archivo" required>
            <label
              htmlFor="docfile"
              className="flex flex-col items-center justify-center w-full py-8 border-2 border-dashed border-rule rounded-premium hover:border-rule-strong hover:bg-paper-100/40 cursor-pointer transition-colors"
            >
              <Upload className="w-6 h-6 text-ink-300 mb-2" />
              {uploadFile ? (
                <>
                  <div className="text-sm font-medium text-ink">{uploadFile.name}</div>
                  <div className="text-xs text-ink-300 mt-1">{formatBytes(uploadFile.size)}</div>
                </>
              ) : (
                <>
                  <div className="text-sm text-ink">Click para elegir un archivo</div>
                  <div className="text-xs text-ink-300 mt-1">PDF, Excel, Word, imagen…</div>
                </>
              )}
              <input
                id="docfile"
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploadFile(f);
                  if (f) {
                    // Auto-detectar carpeta a partir del filename
                    const detected = detectFolderFromFilename(f.name);
                    setUploadFolder(detected);
                  }
                }}
              />
            </label>
          </Field>
          <Field
            label="Carpeta"
            hint={
              uploadFile
                ? "Detectada automáticamente desde el nombre del archivo. Cambialá si la clasificación no es correcta."
                : "Se completa automáticamente al elegir el archivo."
            }
            required
          >
            <Select
              value={uploadFolder}
              onChange={(e) => setUploadFolder(e.target.value as DocumentFolder)}
            >
              {(Object.keys(FOLDER_LABEL) as DocumentFolder[]).map((f) => (
                <option key={f} value={f}>{FOLDER_LABEL[f]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notas (opcional)">
            <Input
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              placeholder='Ej: "Factura del proveedor X — abril 2024"'
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function DocKpiCard({
  label,
  value,
  subValue,
  delta,
  progress,
  icon,
  loading,
}: {
  label: string;
  value: string;
  subValue?: string;
  delta?: number | null;
  progress?: number;
  icon?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="bg-paper border border-rule rounded-premium shadow-premium-xs p-4">
      <div className="flex items-start gap-2.5 mb-2">
        <div className="text-ink-300 bg-paper-200 rounded-premium-sm w-9 h-9 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="text-xs text-ink-400 font-medium leading-tight pt-1.5">
          {label}
        </div>
      </div>
      {loading ? (
        <>
          <div className="skeleton h-7 w-24 mt-2" />
          <div className="skeleton h-3 w-20 mt-2" />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mt-1">
            <div className="text-2xl font-semibold tracking-tight tabular-nums text-ink">
              {value}
            </div>
            {subValue && (
              <div className="text-xs text-ink-300">{subValue}</div>
            )}
          </div>
          {progress != null && (
            <div className="mt-2">
              <div className="h-1.5 bg-paper-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-success transition-all"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
              <div className="text-2xs text-ink-300 mt-1">
                {progress.toFixed(1)}% utilizado
              </div>
            </div>
          )}
          {delta != null && !Number.isNaN(delta) && (
            <div className="mt-2">
              <div className={cn("text-xs font-semibold", (delta ?? 0) >= 0 ? "text-success" : "text-danger")}>
                {(delta ?? 0) >= 0 ? "↑" : "↓"} {Math.abs(delta ?? 0).toFixed(1)}%
              </div>
              <div className="text-2xs text-ink-300 mt-0.5">vs. mes anterior</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
