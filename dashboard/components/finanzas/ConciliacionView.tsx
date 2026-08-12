"use client";

/**
 * ConciliacionView — FIN-2 · Conciliación de extractos bancarios
 *
 * Flujo (todo director):
 *   1. Elegir cuenta + subir el CSV del banco.
 *   2. Mapear columnas (se auto-detectan por nombre y el mapeo queda
 *      guardado por cuenta en localStorage) + preview.
 *   3. Importar → matching determinístico contra cuenta_movimientos:
 *      · Conciliadas (importe exacto, fecha ±3d) — automático.
 *      · Sugeridas (importe exacto con fecha corrida, o ~2%) — CONFIRMAR
 *        o rechazar (gate humano).
 *      · Sin match — crear el movimiento desde la línea (con categoría)
 *        o ignorar.
 *
 * El saldo de la cuenta lo sigue manteniendo el trigger de
 * cuenta_movimientos — crear desde línea usa el flujo normal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listCuentas,
  listMovimientos,
  CATEGORIA_LABEL,
  type CuentaBancaria,
  type CuentaMovimiento,
  type MovimientoCategoria,
} from "@/lib/cuentas-bancarias";
import {
  parseCsv,
  buildLines,
  importStatement,
  listStatements,
  listStatementLines,
  confirmSuggestion,
  rejectSuggestion,
  ignoreLine,
  createMovimientoFromLine,
  type ColumnMapping,
  type ParsedCsv,
  type BankStatement,
  type BankStatementLine,
  type ImportSummary,
} from "@/lib/conciliacion";

const NO_COL = -1;

function guessMapping(headers: string[]): ColumnMapping {
  const find = (re: RegExp) =>
    headers.findIndex((h) => re.test(h.toLowerCase()));
  const debito = find(/d[eé]bito|debe/);
  const credito = find(/cr[eé]dito|haber/);
  return {
    fecha: find(/fecha|date/),
    descripcion: find(/desc|concepto|detalle|referencia|movimiento/),
    monto: debito >= 0 && credito >= 0 ? NO_COL : find(/importe|monto|amount/),
    debito,
    credito,
    saldo: find(/saldo|balance/),
  };
}

const fmtAmount = (n: number) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ConciliacionView() {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [movimientos, setMovimientos] = useState<CuentaMovimiento[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);

  // Import en curso
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  // Extracto activo (recién importado o elegido del historial)
  const [activeStatementId, setActiveStatementId] = useState<string | null>(null);
  const [lines, setLines] = useState<BankStatementLine[]>([]);
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [categoryByLine, setCategoryByLine] = useState<Record<number, MovimientoCategoria>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listCuentas().then((cts) => {
      setCuentas(cts);
      if (cts.length > 0) setCuentaId((prev) => prev || cts[0].id);
    });
  }, []);

  const loadCuentaData = useCallback(async (cid: string) => {
    if (!cid) return;
    const [movs, sts] = await Promise.all([
      listMovimientos({ cuentaId: cid, limit: 1000 }),
      listStatements(cid),
    ]);
    setMovimientos(movs);
    setStatements(sts);
  }, []);

  useEffect(() => {
    setActiveStatementId(null);
    setLines([]);
    setSummary(null);
    loadCuentaData(cuentaId);
  }, [cuentaId, loadCuentaData]);

  const loadLines = useCallback(async (statementId: string) => {
    setActiveStatementId(statementId);
    setLines(await listStatementLines(statementId));
  }, []);

  const movById = useMemo(
    () => new Map(movimientos.map((m) => [m.id, m])),
    [movimientos],
  );

  function onFile(file: File) {
    setErr(null);
    setSummary(null);
    setFileName(file.name);
    file.text().then((text) => {
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        setErr("El archivo no tiene filas (¿es un CSV exportado del banco?).");
        return;
      }
      setCsv(parsed);
      const saved = localStorage.getItem(`conciliacion-map-${cuentaId}`);
      if (saved) {
        try {
          const m = JSON.parse(saved) as ColumnMapping;
          // Solo si los índices siguen existiendo en este archivo.
          const max = parsed.headers.length - 1;
          const valid = [m.fecha, m.descripcion].every((i) => i >= 0 && i <= max);
          setMapping(valid ? m : guessMapping(parsed.headers));
          return;
        } catch {
          /* fallthrough */
        }
      }
      setMapping(guessMapping(parsed.headers));
    });
  }

  async function runImport() {
    if (!csv || !mapping || !cuentaId) return;
    setErr(null);
    const hasAmount = mapping.monto >= 0 || (mapping.debito >= 0 && mapping.credito >= 0);
    if (mapping.fecha < 0 || !hasAmount) {
      setErr("Mapeá al menos Fecha y el importe (columna única o débito+crédito).");
      return;
    }
    const { lines: parsed, skipped } = buildLines(csv.rows, mapping);
    if (parsed.length === 0) {
      setErr(`No se pudo interpretar ninguna fila (${skipped} salteadas). Revisá el mapeo.`);
      return;
    }
    setImporting(true);
    try {
      localStorage.setItem(`conciliacion-map-${cuentaId}`, JSON.stringify(mapping));
      const s = await importStatement(cuentaId, fileName, parsed, movimientos);
      setSummary(s);
      setCsv(null);
      await loadCuentaData(cuentaId);
      await loadLines(s.statementId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function actOnLine(line: BankStatementLine, action: () => Promise<void>) {
    setBusyLine(line.id);
    setErr(null);
    try {
      await action();
      if (activeStatementId) await loadLines(activeStatementId);
      // Crear movimiento cambia el universo de matching → refrescar.
      await loadCuentaData(cuentaId);
      if (activeStatementId) setActiveStatementId(activeStatementId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyLine(null);
    }
  }

  const suggested = lines.filter((l) => l.status === "suggested");
  const unmatched = lines.filter((l) => l.status === "unmatched");
  const matched = lines.filter(
    (l) => l.status === "matched_auto" || l.status === "matched_confirmed",
  );
  const ignored = lines.filter((l) => l.status === "ignored");

  const cuenta = cuentas.find((c) => c.id === cuentaId);

  return (
    <div>
      <div style={head}>
        <div>
          <h2 style={h2}>Conciliación bancaria</h2>
          <div style={sub}>
            Subí el extracto CSV del banco y el sistema lo cruza contra los
            movimientos registrados: lo exacto se concilia solo, lo dudoso te
            lo propone con motivo y lo que falta lo creás con un click. Nada
            se registra sin tu confirmación.
          </div>
        </div>
        <select
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          style={selectStyle}
        >
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.bank_name} ···{c.last4} ({c.currency})
            </option>
          ))}
        </select>
      </div>

      {err && <div style={errorBox}>{err}</div>}

      {/* ===== Paso 1: archivo ===== */}
      <div style={{ ...panel, marginBottom: 16 }}>
        <div style={panelTitle}>Importar extracto {cuenta ? `· ${cuenta.bank_name} (${cuenta.currency})` : ""}</div>
        <input
          type="file"
          accept=".csv,text/csv,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        {summary && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <strong>{summary.total}</strong> líneas importadas de {fileName}:{" "}
            <span style={{ color: "var(--deep-green)" }}>✓ {summary.auto} conciliadas solas</span>
            {" · "}
            <span style={{ color: "#B45309" }}>? {summary.suggested} sugeridas</span>
            {" · "}
            <span style={{ color: "#B91C1C" }}>✗ {summary.unmatched} sin match</span>
          </div>
        )}
      </div>

      {/* ===== Paso 2: mapeo + preview ===== */}
      {csv && mapping && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={panelTitle}>Mapeo de columnas — {fileName}</div>
          <div style={mapGrid}>
            {(
              [
                ["fecha", "Fecha *"],
                ["descripcion", "Descripción"],
                ["monto", "Importe (con signo)"],
                ["debito", "Débito"],
                ["credito", "Crédito"],
                ["saldo", "Saldo"],
              ] as [keyof ColumnMapping, string][]
            ).map(([key, label]) => (
              <label key={key} style={{ fontSize: 12 }}>
                <div style={statLabel}>{label}</div>
                <select
                  value={mapping[key]}
                  onChange={(e) =>
                    setMapping({ ...mapping, [key]: Number(e.target.value) })
                  }
                  style={{ ...selectStyle, width: "100%" }}
                >
                  <option value={NO_COL}>— no está —</option>
                  {csv.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `(columna ${i + 1})`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
            Usá <em>Importe</em> si el banco exporta una sola columna con signo,
            o <em>Débito + Crédito</em> si vienen separadas. El mapeo queda
            guardado para esta cuenta.
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {csv.headers.map((h, i) => (
                    <th key={i} style={cellHead}>{h || `col ${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csv.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri}>
                    {csv.headers.map((_, ci) => (
                      <td key={ci} style={cell}>{row[ci] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={runImport} disabled={importing} style={primaryBtn}>
            {importing ? "Conciliando…" : `Importar y conciliar (${csv.rows.length} filas)`}
          </button>
        </div>
      )}

      {/* ===== Cola: sugeridas ===== */}
      {suggested.length > 0 && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={panelTitle}>A confirmar ({suggested.length}) — el matcher propone, vos decidís</div>
          {suggested.map((l) => {
            const mov = l.suggestion ? movById.get(l.suggestion.movimiento_id) : null;
            return (
              <div key={l.id} style={queueRow}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={lineMain}>
                    {l.fecha} · <strong>{fmtAmount(l.amount)}</strong> · {l.description || "(sin descripción)"}
                  </div>
                  {mov && l.suggestion && (
                    <div style={lineSub}>
                      ¿Es este? <strong>{mov.fecha}</strong> ·{" "}
                      {fmtAmount(mov.entry_amount - mov.exit_amount)} · {mov.description}
                      {" — "}score {l.suggestion.score} ({l.suggestion.reasons.join(", ")})
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    style={primaryBtnSm}
                    disabled={busyLine === l.id}
                    onClick={() => actOnLine(l, () => confirmSuggestion(l))}
                  >
                    Confirmar
                  </button>
                  <button
                    style={ghostBtnSm}
                    disabled={busyLine === l.id}
                    onClick={() => actOnLine(l, () => rejectSuggestion(l))}
                  >
                    No es
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Cola: sin match ===== */}
      {unmatched.length > 0 && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={panelTitle}>Sin match ({unmatched.length}) — crear el movimiento que falta o ignorar</div>
          {unmatched.map((l) => (
            <div key={l.id} style={queueRow}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={lineMain}>
                  {l.fecha} · <strong style={{ color: l.amount < 0 ? "#B91C1C" : "var(--deep-green)" }}>{fmtAmount(l.amount)}</strong> · {l.description || "(sin descripción)"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select
                  value={categoryByLine[l.id] ?? (l.amount > 0 ? "ingreso" : "gasto")}
                  onChange={(e) =>
                    setCategoryByLine({
                      ...categoryByLine,
                      [l.id]: e.target.value as MovimientoCategoria,
                    })
                  }
                  style={selectStyle}
                >
                  {Object.entries(CATEGORIA_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
                <button
                  style={primaryBtnSm}
                  disabled={busyLine === l.id}
                  onClick={() =>
                    actOnLine(l, () =>
                      createMovimientoFromLine(
                        l,
                        categoryByLine[l.id] ?? (l.amount > 0 ? "ingreso" : "gasto"),
                      ),
                    )
                  }
                >
                  Crear movimiento
                </button>
                <button
                  style={ghostBtnSm}
                  disabled={busyLine === l.id}
                  onClick={() => actOnLine(l, () => ignoreLine(l))}
                >
                  Ignorar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Conciliadas ===== */}
      {matched.length > 0 && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={panelTitle}>Conciliadas ({matched.length}{ignored.length > 0 ? ` · ${ignored.length} ignoradas` : ""})</div>
          {matched.slice(0, 50).map((l) => (
            <div key={l.id} style={tableRow}>
              <span>
                {l.fecha} · {fmtAmount(l.amount)} · {l.description}
              </span>
              <span style={{ fontSize: 11, color: "var(--sand-dark)" }}>
                {l.status === "matched_auto" ? "auto" : "confirmada"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ===== Historial ===== */}
      {statements.length > 0 && (
        <div style={panel}>
          <div style={panelTitle}>Extractos importados</div>
          {statements.map((s) => (
            <div key={s.id} style={tableRow}>
              <span>
                {s.created_at.slice(0, 10)} · {s.file_name} ({s.line_count} líneas)
              </span>
              <button style={ghostBtnSm} onClick={() => loadLines(s.id)}>
                {activeStatementId === s.id ? "Viendo" : "Ver"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== estilos (idioma de CostosApiView) ====================

const head: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};
const h2: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: "var(--deep-green)",
  margin: 0,
};
const sub: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  marginTop: 6,
  maxWidth: 640,
  lineHeight: 1.5,
};
const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--white)",
};
const panel: React.CSSProperties = {
  background: "var(--white)",
  border: "1px solid var(--hairline)",
  borderRadius: 12,
  padding: 20,
  fontSize: 13,
  color: "var(--text-muted)",
};
const panelTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--deep-green)",
  marginBottom: 12,
};
const statLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--sand-dark)",
  fontWeight: 700,
  marginBottom: 6,
};
const mapGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
};
const cellHead: React.CSSProperties = {
  border: "1px solid var(--hairline)",
  padding: "4px 8px",
  background: "rgba(196,168,130,0.12)",
  color: "var(--deep-green)",
  textAlign: "left",
  whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  border: "1px solid var(--hairline)",
  padding: "4px 8px",
  whiteSpace: "nowrap",
  maxWidth: 220,
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const primaryBtn: React.CSSProperties = {
  marginTop: 14,
  padding: "9px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--deep-green)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const primaryBtnSm: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "none",
  background: "var(--deep-green)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const ghostBtnSm: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid rgba(10,26,12,0.2)",
  background: "transparent",
  color: "var(--deep-green)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const queueRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid var(--hairline)",
  flexWrap: "wrap",
};
const lineMain: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--deep-green)",
};
const lineSub: React.CSSProperties = {
  fontSize: 11.5,
  color: "#B45309",
  marginTop: 4,
  lineHeight: 1.4,
};
const tableRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid var(--hairline)",
  fontSize: 12.5,
  color: "var(--deep-green)",
};
const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(176,75,58,0.08)",
  border: "1px solid rgba(176,75,58,0.25)",
  borderRadius: 6,
  fontSize: 12.5,
  color: "#B91C1C",
  marginBottom: 16,
};
