// ==================== PHASE REPORTS · CLIENT-SIDE HELPERS ====================
// Reads + simple mutations sobre phase_reports desde el browser.
// La generación pesada (que requiere service role key + Claude) vive
// en /api/phases/generate.

import { getSupabase } from "./supabase/client";
import type { PhaseKey, PhaseReport, PhaseStatus } from "./types";

const PHASE_REPORT_COLS =
  "id, client_id, phase, status, content_md, feedback, version, model, usage, generated_at, approved_at, approved_by, created_at, updated_at";

export async function listPhaseReports(
  clientId: string,
): Promise<PhaseReport[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("phase_reports")
    .select(PHASE_REPORT_COLS)
    .eq("client_id", clientId);
  if (error) {
    console.error("listPhaseReports error:", error);
    return [];
  }
  return (data ?? []) as PhaseReport[];
}

export async function getPhaseReport(
  clientId: string,
  phase: PhaseKey,
): Promise<PhaseReport | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("phase_reports")
    .select(PHASE_REPORT_COLS)
    .eq("client_id", clientId)
    .eq("phase", phase)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as PhaseReport | null;
}

// Construye un mapa { phase: report } para fácil acceso desde la UI.
export function buildPhaseMap(
  reports: PhaseReport[],
): Record<PhaseKey, PhaseReport | undefined> {
  const map: Record<string, PhaseReport | undefined> = {};
  for (const r of reports) map[r.phase] = r;
  return map as Record<PhaseKey, PhaseReport | undefined>;
}

// Status display helpers
export function phaseStatusLabel(status: PhaseStatus | "locked"): string {
  switch (status) {
    case "locked":
      return "Bloqueado";
    case "pending":
      return "Listo para generar";
    case "generating":
      return "Generando…";
    case "draft":
      return "Esperando review";
    case "changes_requested":
      return "Cambios solicitados";
    case "approved":
      return "Aprobado";
  }
}

export function phaseStatusColor(status: PhaseStatus | "locked"): string {
  switch (status) {
    case "locked":
      return "var(--text-muted)";
    case "pending":
      return "var(--sand-dark)";
    case "generating":
      return "var(--sand)";
    case "draft":
      return "var(--yellow-warn)";
    case "changes_requested":
      return "var(--red-warn)";
    case "approved":
      return "var(--green-ok)";
  }
}
