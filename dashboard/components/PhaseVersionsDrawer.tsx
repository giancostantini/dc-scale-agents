"use client";

/**
 * Drawer para comparar versiones de un reporte de fase.
 *
 * Cuando el director ya iteró un reporte (v1, v2, v3...), este
 * drawer permite ver QUÉ CAMBIÓ entre dos versiones específicas:
 * texto agregado en verde, removido en rojo. Útil para validar
 * que el modo edición efectivamente solo cambió lo que se pidió.
 *
 * Flow:
 * 1. Director clickea "Comparar versiones" en la página del reporte.
 * 2. Drawer hace GET /api/phases/versions → lista de versiones.
 * 3. Selecciona "from" y "to" (default: previa vs actual).
 * 4. Drawer hace GET /api/phases/versions/content para cada uno.
 * 5. Renderiza un diff line-by-line usando la lib `diff`.
 */

import { useEffect, useMemo, useState } from "react";
import { diffLines } from "diff";
import { getSupabase } from "@/lib/supabase/client";
import styles from "./PhaseVersionsDrawer.module.css";

interface VersionMeta {
  version: number;
  generated_at: string;
  feedback: string | null;
  isCurrent: boolean;
}

interface VersionContent {
  version: number;
  content_md: string;
  generated_at: string;
  feedback: string | null;
  isCurrent: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  phaseKey: string; // "diagnostico" | "estrategia" | "setup" | "lanzamiento"
  phaseLabel: string; // "Diagnóstico" para el title
  /** version actual del reporte — para preseleccionar el "to". */
  currentVersion: number | null;
}

async function authFetch(endpoint: string) {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sin sesión");
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export default function PhaseVersionsDrawer({
  open,
  onClose,
  clientId,
  phaseKey,
  phaseLabel,
  currentVersion,
}: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Versiones seleccionadas para comparar.
  // toVersion = la "nueva", fromVersion = la "vieja".
  const [fromVersion, setFromVersion] = useState<number | null>(null);
  const [toVersion, setToVersion] = useState<number | null>(null);

  // Contenido cacheado de versiones que ya bajamos (no querer hacer
  // round-trip cada vez que el usuario cambia el selector).
  const [contentCache, setContentCache] = useState<Record<number, VersionContent>>(
    {},
  );
  const [loadingContent, setLoadingContent] = useState(false);

  // Cargar la lista cuando se abre
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingList(true);
    setError(null);
    authFetch(
      `/api/phases/versions?clientId=${encodeURIComponent(clientId)}&phase=${phaseKey}`,
    )
      .then((data) => {
        if (cancelled) return;
        const list = (data.versions ?? []) as VersionMeta[];
        setVersions(list);
        // Defaults: TO = current, FROM = previous (si hay)
        if (list.length >= 2) {
          setToVersion(list[0].version);
          setFromVersion(list[1].version);
        } else if (list.length === 1) {
          setToVersion(list[0].version);
          setFromVersion(null);
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clientId, phaseKey]);

  // Cuando cambian las versiones seleccionadas, bajar el contenido faltante
  useEffect(() => {
    if (!open) return;
    if (!fromVersion || !toVersion) return;
    const needed = [fromVersion, toVersion].filter((v) => !(v in contentCache));
    if (needed.length === 0) return;
    let cancelled = false;
    setLoadingContent(true);
    Promise.all(
      needed.map((v) =>
        authFetch(
          `/api/phases/versions/content?clientId=${encodeURIComponent(clientId)}&phase=${phaseKey}&version=${v}`,
        ),
      ),
    )
      .then((results: VersionContent[]) => {
        if (cancelled) return;
        const next = { ...contentCache };
        for (const r of results) next[r.version] = r;
        setContentCache(next);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromVersion, toVersion]);

  // Reset cuando se cierra
  useEffect(() => {
    if (open) return;
    setVersions([]);
    setFromVersion(null);
    setToVersion(null);
    setContentCache({});
    setError(null);
  }, [open]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Calcular el diff cuando ambos contenidos están cargados
  const diffResult = useMemo(() => {
    if (!fromVersion || !toVersion) return null;
    const fromContent = contentCache[fromVersion]?.content_md;
    const toContent = contentCache[toVersion]?.content_md;
    if (fromContent === undefined || toContent === undefined) return null;
    // diffLines compara línea por línea, agrupando hunks added/removed/unchanged.
    return diffLines(fromContent, toContent);
  }, [fromVersion, toVersion, contentCache]);

  // Stats: cantidad de líneas agregadas y removidas
  const stats = useMemo(() => {
    if (!diffResult) return { added: 0, removed: 0 };
    let added = 0;
    let removed = 0;
    for (const part of diffResult) {
      const lineCount = part.value.split("\n").length - 1 || 1;
      if (part.added) added += lineCount;
      if (part.removed) removed += lineCount;
    }
    return { added, removed };
  }, [diffResult]);

  if (!open) return null;

  const fmt = (iso: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const versionOptionLabel = (v: VersionMeta) => {
    const tag = v.isCurrent ? " · actual" : "";
    return `v${v.version}${tag} — ${fmt(v.generated_at)}`;
  };

  const fromMeta = versions.find((v) => v.version === fromVersion) ?? null;
  const toMeta = versions.find((v) => v.version === toVersion) ?? null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.drawer} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.eyebrow}>Historial · {phaseLabel}</div>
            <h2 className={styles.title}>Comparar versiones</h2>
            <div className={styles.subtitle}>
              {currentVersion
                ? `Versión actual: v${currentVersion}`
                : "Sin versiones generadas aún"}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            Cerrar
          </button>
        </div>

        {/* Selectores */}
        {versions.length >= 2 && (
          <div className={styles.controls}>
            <div className={styles.selectGroup}>
              <label className={styles.selectLabel}>Desde (vieja)</label>
              <select
                className={styles.select}
                value={fromVersion ?? ""}
                onChange={(e) => setFromVersion(parseInt(e.target.value, 10))}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {versionOptionLabel(v)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.arrow}>→</div>
            <div className={styles.selectGroup}>
              <label className={styles.selectLabel}>Hasta (nueva)</label>
              <select
                className={styles.select}
                value={toVersion ?? ""}
                onChange={(e) => setToVersion(parseInt(e.target.value, 10))}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {versionOptionLabel(v)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.statsBox}>
              <span className={styles.statAdd}>+{stats.added} líneas</span>
              <span className={styles.statRemove}>−{stats.removed} líneas</span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className={styles.body}>
          {loadingList && <div className={styles.loading}>Cargando versiones…</div>}

          {error && !loadingList && (
            <div className={styles.empty}>
              No se pudo cargar el historial: {error}
            </div>
          )}

          {!loadingList && !error && versions.length === 0 && (
            <div className={styles.empty}>
              Este reporte todavía no tiene versiones generadas.
            </div>
          )}

          {!loadingList && !error && versions.length === 1 && (
            <div className={styles.singleVersion}>
              <strong>Solo hay una versión (v{versions[0].version})</strong>
              <br />
              No hay con qué comparar todavía. Cuando el director pida cambios
              y se regenere el reporte, vas a ver el diff entre la versión
              anterior y la nueva acá.
            </div>
          )}

          {versions.length >= 2 && (
            <>
              {/* Si la versión "to" tuvo feedback, lo mostramos arriba como contexto */}
              {toMeta?.feedback && (
                <div className={styles.feedbackBox}>
                  <strong>
                    Feedback aplicado para v{toMeta.version}
                  </strong>
                  {toMeta.feedback}
                </div>
              )}

              {loadingContent && (
                <div className={styles.loading}>Cargando contenido…</div>
              )}

              {!loadingContent && diffResult && (
                <DiffView diff={diffResult} />
              )}

              {!loadingContent && !diffResult && fromMeta && toMeta && (
                <div className={styles.empty}>
                  Esperando contenido…
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// DiffView — pinta el resultado de diffLines como hunks visuales
// ============================================================
function DiffView({ diff }: { diff: { added?: boolean; removed?: boolean; value: string }[] }) {
  // Aplanamos a líneas individuales con estado, conservando un
  // contador para mostrar números de línea (sirve como referencia).
  type Row = { kind: "added" | "removed" | "unchanged"; text: string; oldNum: number | null; newNum: number | null };
  const rows: Row[] = [];
  let oldNum = 1;
  let newNum = 1;
  for (const part of diff) {
    const lines = part.value.split("\n");
    // Si el texto termina con \n, split deja un "" al final que ignoramos.
    const realLines = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
    for (const line of realLines) {
      if (part.added) {
        rows.push({ kind: "added", text: line, oldNum: null, newNum });
        newNum++;
      } else if (part.removed) {
        rows.push({ kind: "removed", text: line, oldNum, newNum: null });
        oldNum++;
      } else {
        rows.push({ kind: "unchanged", text: line, oldNum, newNum });
        oldNum++;
        newNum++;
      }
    }
  }

  return (
    <div className={styles.diffContainer}>
      {rows.map((row, i) => {
        const cls =
          row.kind === "added"
            ? styles.lineAdded
            : row.kind === "removed"
              ? styles.lineRemoved
              : styles.lineUnchanged;
        const prefix = row.kind === "added" ? "+" : row.kind === "removed" ? "−" : "·";
        const num = row.kind === "removed" ? row.oldNum : row.newNum;
        return (
          <div key={i} className={`${styles.diffLine} ${cls}`}>
            <span className={styles.lineGutter}>{num ?? ""}</span>
            <span className={styles.linePrefix}>{prefix}</span>
            <span className={styles.lineContent}>{row.text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}
