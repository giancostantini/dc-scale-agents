// ==================== CONCILIACIÓN BANCARIA (FIN-2) ====================
// Import de extractos CSV + matching determinístico contra
// cuenta_movimientos. Sin IA (regla anti-teatro, doc 16): el scoring es
// heurístico y explicable — cada sugerencia lleva sus razones.
//
// Todas las operaciones requieren rol director (RLS, mig 087).

import { getSupabase } from "./supabase/client";
import {
  createMovimiento,
  type CuentaMovimiento,
  type MovimientoCategoria,
} from "./cuentas-bancarias";

export type LineStatus =
  | "matched_auto"
  | "matched_confirmed"
  | "suggested"
  | "unmatched"
  | "ignored";

export interface BankStatement {
  id: string;
  cuenta_id: string;
  file_name: string;
  line_count: number;
  created_at: string;
}

export interface LineSuggestion {
  movimiento_id: string;
  score: number;
  reasons: string[];
}

export interface BankStatementLine {
  id: number;
  statement_id: string;
  cuenta_id: string;
  fecha: string; // YYYY-MM-DD
  description: string;
  amount: number; // >0 entrada, <0 salida
  saldo: number | null;
  status: LineStatus;
  matched_movimiento_id: string | null;
  suggestion: LineSuggestion | null;
}

/** Línea ya parseada y normalizada, lista para importar. */
export interface ParsedLine {
  fecha: string; // YYYY-MM-DD
  description: string;
  amount: number;
  saldo: number | null;
}

// ==================== PARSER CSV ====================

/** Divide una línea CSV respetando comillas. */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Autodetecta el delimitador (; , o tab) contando en las primeras líneas. */
function detectDelimiter(lines: string[]): string {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = 0;
  for (const d of candidates) {
    const count = lines
      .slice(0, 5)
      .reduce((s, l) => s + (l.split(d).length - 1), 0);
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

/** Parsea el texto de un CSV. La primera fila no vacía = headers. */
export function parseCsv(text: string): ParsedCsv {
  const lines = text
    .replace(/^﻿/, "") // BOM
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], delimiter: ";" };
  const delimiter = detectDelimiter(lines);
  const headers = splitCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((l) => splitCsvLine(l, delimiter));
  return { headers, rows, delimiter };
}

/**
 * Normaliza un importe en cualquier formato regional:
 *   "1.234,56" → 1234.56 · "1,234.56" → 1234.56 · "(500)" → -500
 *   "$ 1.200" → 1200 · "-1200,50" → -1200.5
 */
export function normalizeAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  const negative = /^\(.*\)$/.test(s) || s.includes("-");
  s = s.replace(/[()\s]/g, "").replace(/[^\d.,-]/g, "").replace(/-/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // decimal = coma (es-UY): puntos son miles
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // decimal = punto (en-US): comas son miles
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Normaliza fechas dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd → YYYY-MM-DD. */
export function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().slice(0, 10);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    if (Number(month) > 12) return null; // formato raro (mm/dd?) — no adivinar
    return `${year}-${month}-${day}`;
  }
  return null;
}

/** Mapeo de columnas elegido por el usuario. Índices sobre headers, -1 = no está. */
export interface ColumnMapping {
  fecha: number;
  descripcion: number;
  /** Columna única de importe con signo… */
  monto: number;
  /** …o columnas separadas débito/crédito (tienen prioridad si ambas >= 0). */
  debito: number;
  credito: number;
  saldo: number;
}

export function buildLines(
  rows: string[][],
  map: ColumnMapping,
): { lines: ParsedLine[]; skipped: number } {
  const lines: ParsedLine[] = [];
  let skipped = 0;
  for (const row of rows) {
    const fecha = normalizeDate(row[map.fecha] ?? "");
    let amount: number | null = null;
    if (map.debito >= 0 && map.credito >= 0) {
      const deb = normalizeAmount(row[map.debito] ?? "");
      const cred = normalizeAmount(row[map.credito] ?? "");
      if (deb != null && Math.abs(deb) > 0) amount = -Math.abs(deb);
      else if (cred != null && Math.abs(cred) > 0) amount = Math.abs(cred);
    } else if (map.monto >= 0) {
      amount = normalizeAmount(row[map.monto] ?? "");
    }
    if (!fecha || amount == null || amount === 0) {
      skipped++;
      continue;
    }
    lines.push({
      fecha,
      description: (row[map.descripcion] ?? "").slice(0, 300),
      amount: Math.round(amount * 100) / 100,
      saldo: map.saldo >= 0 ? normalizeAmount(row[map.saldo] ?? "") : null,
    });
  }
  return { lines, skipped };
}

// ==================== MATCHER DETERMINÍSTICO ====================

const EXACT_DATE_WINDOW = 3; // días para auto-match
const SUGGEST_DATE_WINDOW = 10; // días para sugerencias
const AMOUNT_TOLERANCE_PCT = 0.02; // 2% (comisiones/redondeos)
const SUGGEST_MIN_SCORE = 55;

function daysDiff(a: string, b: string): number {
  return Math.abs(
    Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000),
  );
}

/** Importe con signo de un movimiento registrado. */
function movSignedAmount(m: CuentaMovimiento): number {
  return Math.round((m.entry_amount - m.exit_amount) * 100) / 100;
}

/** Overlap de tokens (>=4 chars) entre descripciones — bonus de score. */
function descriptionOverlap(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4),
    );
  const ta = tok(a);
  const tb = tok(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits;
}

export interface MatchResult {
  line: ParsedLine;
  status: "matched_auto" | "suggested" | "unmatched";
  movimientoId: string | null;
  suggestion: LineSuggestion | null;
}

/**
 * Matching puro (testeable): cada línea contra los movimientos NO
 * conciliados de la cuenta. Un movimiento se consume al matchear para
 * que dos líneas no apunten al mismo.
 */
export function matchLines(
  lines: ParsedLine[],
  movimientos: CuentaMovimiento[],
  alreadyMatchedIds: Set<string>,
): MatchResult[] {
  const available = movimientos.filter((m) => !alreadyMatchedIds.has(m.id));
  const consumed = new Set<string>();
  const results: MatchResult[] = [];

  for (const line of lines) {
    let auto: CuentaMovimiento | null = null;
    let bestSuggestion: { mov: CuentaMovimiento; score: number; reasons: string[] } | null =
      null;

    for (const mov of available) {
      if (consumed.has(mov.id)) continue;
      const movAmount = movSignedAmount(mov);
      const sameSign = (movAmount >= 0) === (line.amount >= 0);
      if (!sameSign) continue;

      const amountDiff = Math.abs(movAmount - line.amount);
      const amountExact = amountDiff <= 0.01;
      const amountClose =
        amountDiff <= Math.abs(line.amount) * AMOUNT_TOLERANCE_PCT + 0.01;
      const dDiff = daysDiff(line.fecha, mov.fecha);

      // Auto: importe exacto + fecha en ventana corta.
      if (amountExact && dDiff <= EXACT_DATE_WINDOW) {
        auto = mov;
        break;
      }

      // Sugerencia con score explicable.
      if (dDiff <= SUGGEST_DATE_WINDOW && (amountExact || amountClose)) {
        const reasons: string[] = [];
        let score = 0;
        if (amountExact) {
          score += 70;
          reasons.push("importe exacto");
        } else {
          score += 45;
          reasons.push(`importe ~${amountDiff.toFixed(2)} de diferencia (≤2%)`);
        }
        score += Math.max(0, 20 - dDiff * 2);
        reasons.push(`fecha a ${dDiff} día(s)`);
        const overlap = descriptionOverlap(line.description, mov.description);
        if (overlap > 0) {
          score += Math.min(15, overlap * 5);
          reasons.push("descripción similar");
        }
        if (!bestSuggestion || score > bestSuggestion.score) {
          bestSuggestion = { mov, score, reasons };
        }
      }
    }

    if (auto) {
      consumed.add(auto.id);
      results.push({
        line,
        status: "matched_auto",
        movimientoId: auto.id,
        suggestion: null,
      });
    } else if (bestSuggestion && bestSuggestion.score >= SUGGEST_MIN_SCORE) {
      // No consumimos el movimiento sugerido: dos líneas pueden proponer el
      // mismo candidato y el humano decide cuál es (al confirmar una, la
      // otra se re-resuelve).
      results.push({
        line,
        status: "suggested",
        movimientoId: null,
        suggestion: {
          movimiento_id: bestSuggestion.mov.id,
          score: Math.round(bestSuggestion.score),
          reasons: bestSuggestion.reasons,
        },
      });
    } else {
      results.push({ line, status: "unmatched", movimientoId: null, suggestion: null });
    }
  }

  return results;
}

// ==================== IMPORT + ACCIONES ====================

export interface ImportSummary {
  statementId: string;
  total: number;
  auto: number;
  suggested: number;
  unmatched: number;
}

export async function importStatement(
  cuentaId: string,
  fileName: string,
  lines: ParsedLine[],
  movimientos: CuentaMovimiento[],
): Promise<ImportSummary> {
  if (lines.length === 0) throw new Error("El extracto no tiene líneas válidas.");
  const supabase = getSupabase();

  // Movimientos ya conciliados en imports anteriores → no re-matchear.
  const { data: prevMatched } = await supabase
    .from("bank_statement_lines")
    .select("matched_movimiento_id")
    .eq("cuenta_id", cuentaId)
    .not("matched_movimiento_id", "is", null);
  const alreadyMatched = new Set(
    ((prevMatched ?? []) as { matched_movimiento_id: string }[]).map(
      (r) => r.matched_movimiento_id,
    ),
  );

  const results = matchLines(lines, movimientos, alreadyMatched);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: statement, error: stErr } = await supabase
    .from("bank_statements")
    .insert({
      cuenta_id: cuentaId,
      file_name: fileName,
      line_count: lines.length,
      imported_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (stErr || !statement) {
    throw new Error(`No se pudo crear el extracto: ${stErr?.message ?? "?"}`);
  }

  const { error: linesErr } = await supabase.from("bank_statement_lines").insert(
    results.map((r) => ({
      statement_id: statement.id,
      cuenta_id: cuentaId,
      fecha: r.line.fecha,
      description: r.line.description,
      amount: r.line.amount,
      saldo: r.line.saldo,
      status: r.status,
      matched_movimiento_id: r.movimientoId,
      suggestion: r.suggestion,
    })),
  );
  if (linesErr) {
    throw new Error(`No se pudieron guardar las líneas: ${linesErr.message}`);
  }

  return {
    statementId: statement.id as string,
    total: results.length,
    auto: results.filter((r) => r.status === "matched_auto").length,
    suggested: results.filter((r) => r.status === "suggested").length,
    unmatched: results.filter((r) => r.status === "unmatched").length,
  };
}

export async function listStatements(cuentaId: string): Promise<BankStatement[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bank_statements")
    .select("id, cuenta_id, file_name, line_count, created_at")
    .eq("cuenta_id", cuentaId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("listStatements:", error);
    return [];
  }
  return (data ?? []) as BankStatement[];
}

export async function listStatementLines(
  statementId: string,
): Promise<BankStatementLine[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bank_statement_lines")
    .select("*")
    .eq("statement_id", statementId)
    .order("fecha", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error("listStatementLines:", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    ...r,
    amount: typeof r.amount === "string" ? parseFloat(r.amount) : r.amount,
    saldo: r.saldo == null ? null : typeof r.saldo === "string" ? parseFloat(r.saldo) : r.saldo,
  })) as BankStatementLine[];
}

async function setLine(
  lineId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("bank_statement_lines")
    .update(patch)
    .eq("id", lineId);
  if (error) throw new Error(`No se pudo actualizar la línea: ${error.message}`);
}

/** Confirma la sugerencia (gate humano) → conciliada. */
export async function confirmSuggestion(line: BankStatementLine): Promise<void> {
  if (!line.suggestion) throw new Error("La línea no tiene sugerencia.");
  await setLine(line.id, {
    status: "matched_confirmed",
    matched_movimiento_id: line.suggestion.movimiento_id,
  });
}

/** Rechaza la sugerencia → vuelve a la bandeja sin match. */
export async function rejectSuggestion(line: BankStatementLine): Promise<void> {
  await setLine(line.id, { status: "unmatched", matched_movimiento_id: null });
}

/** Ignora la línea (no es un movimiento a registrar — ej. línea informativa). */
export async function ignoreLine(line: BankStatementLine): Promise<void> {
  await setLine(line.id, { status: "ignored" });
}

/**
 * Crea el movimiento que faltaba desde la línea del extracto (usa el flujo
 * normal — el trigger actualiza el saldo) y deja la línea conciliada.
 */
export async function createMovimientoFromLine(
  line: BankStatementLine,
  category: MovimientoCategoria,
): Promise<void> {
  const mov = await createMovimiento({
    cuenta_id: line.cuenta_id,
    fecha: line.fecha,
    description: line.description || "Movimiento del extracto",
    category,
    entry_amount: line.amount > 0 ? line.amount : 0,
    exit_amount: line.amount < 0 ? Math.abs(line.amount) : 0,
    notes: "Creado desde conciliación (FIN-2)",
  });
  await setLine(line.id, {
    status: "matched_confirmed",
    matched_movimiento_id: mov.id,
  });
}
