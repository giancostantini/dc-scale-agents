"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

/**
 * DataTable premium estilo Mercury / Linear / Notion.
 *
 * Features:
 *  - Tipografía compacta, bordes finitos, hover sutil
 *  - Búsqueda global con icono
 *  - Sort por columna (click en header)
 *  - Paginación
 *  - Empty state premium
 *  - Loading skeleton
 *  - Export CSV
 *  - Acciones rápidas por fila (slot)
 *
 * Genérica: usa generics para typar las rows.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Render custom de la celda. Default: row[key as keyof T]. */
  cell?: (row: T) => ReactNode;
  /** Si la columna es sortable. */
  sortable?: boolean;
  /** Valor de comparación para sort (default: stringify de la celda). */
  sortValue?: (row: T) => string | number;
  /** Alineación. */
  align?: "left" | "center" | "right";
  /** Ancho fijo (CSS width). */
  width?: string;
  /** Clase extra. */
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Si se setea, hay row click. */
  onRowClick?: (row: T) => void;
  /** Acciones por fila (botones). Se renderizan en última columna. */
  rowActions?: (row: T) => ReactNode;
  /** Función para buscar (default: stringify de toda la fila). */
  searchFn?: (row: T, query: string) => boolean;
  searchPlaceholder?: string;
  /** Page size default (default 10). */
  pageSize?: number;
  /** Empty state custom. */
  emptyState?: {
    title: string;
    description?: string;
    action?: ReactNode;
  };
  /** Loading skeleton. */
  loading?: boolean;
  /** Filename del CSV export. Sin .csv. Si no se setea, no muestra el botón. */
  exportFilename?: string;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  onRowClick,
  rowActions,
  searchFn,
  searchPlaceholder = "Buscar…",
  pageSize = 10,
  emptyState,
  loading,
  exportFilename,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase().trim();
    return data.filter((r) =>
      searchFn
        ? searchFn(r, q)
        : JSON.stringify(r).toLowerCase().includes(q),
    );
  }, [data, search, searchFn]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const getValue = col.sortValue ?? ((row: T) => String((row as Record<string, unknown>)[col.key] ?? ""));
    return [...filtered].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function exportCsv() {
    if (!exportFilename) return;
    const header = columns.map((c) => `"${c.header}"`).join(",");
    const rows = sorted.map((r) =>
      columns
        .map((c) => {
          const v = c.cell ? "" : (r as Record<string, unknown>)[c.key];
          const s = String(v ?? "");
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    const csv = "﻿" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-paper border border-rule rounded-premium shadow-premium-xs overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-rule flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 h-8 text-xs bg-paper-100 border border-rule rounded-premium-sm placeholder-ink-300 focus:outline-none focus:border-ink-300 focus:bg-paper transition-colors"
          />
        </div>
        <div className="flex-1" />
        <div className="text-2xs text-ink-300 tabular-nums">
          {sorted.length} {sorted.length === 1 ? "fila" : "filas"}
        </div>
        {exportFilename && sorted.length > 0 && (
          <Button variant="ghost" size="sm" onClick={exportCsv}>
            Exportar
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule bg-paper-100/60">
              {columns.map((col) => {
                const isSorted = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      "text-2xs uppercase tracking-[0.08em] font-semibold text-ink-300 px-4 py-2.5 text-left whitespace-nowrap",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.sortable && "cursor-pointer hover:text-ink select-none",
                      col.className,
                    )}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable &&
                        (isSorted ? (
                          sort?.dir === "asc" ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40" />
                        ))}
                    </span>
                  </th>
                );
              })}
              {rowActions && (
                <th className="w-1 px-4 py-2.5"></th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-rule-soft">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <div className="skeleton h-3.5 w-3/4" />
                    </td>
                  ))}
                  {rowActions && <td />}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="px-4 py-16 text-center"
                >
                  <div className="text-md font-medium text-ink mb-1">
                    {emptyState?.title ?? "Sin resultados"}
                  </div>
                  {emptyState?.description && (
                    <div className="text-xs text-ink-300 mb-4">
                      {emptyState.description}
                    </div>
                  )}
                  {emptyState?.action}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-rule-soft transition-colors",
                    onRowClick && "cursor-pointer hover:bg-paper-100",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-ink",
                        col.align === "right" && "text-right tabular-nums",
                        col.align === "center" && "text-center",
                        col.className,
                      )}
                    >
                      {col.cell
                        ? col.cell(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "—")}
                    </td>
                  ))}
                  {rowActions && (
                    <td
                      className="px-4 py-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rowActions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-rule flex items-center justify-between">
          <div className="text-2xs text-ink-300">
            Página {safePage + 1} de {totalPages}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(0)}
              disabled={safePage === 0}
            >
              ‹‹
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 0}
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= totalPages - 1}
            >
              Siguiente
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
            >
              ››
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
