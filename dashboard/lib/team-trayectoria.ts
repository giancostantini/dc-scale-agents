// ==================== TEAM · TRAYECTORIA ====================
// Helpers para los tres tipos de historial del equipo:
//   - position_history   (cambios de cargo)
//   - salary_history     (cambios de sueldo)
//   - team_milestones    (hitos / notas manuales)
//
// Lectura es libre para el usuario sobre su propia data y para
// directores sobre todos. Escritura es solo director (RLS en DB).

import { getSupabase } from "./supabase/client";

// ============ Tipos ============

export interface PositionHistoryRow {
  id: string;
  user_id: string;
  position: string;
  start_date: string;
  end_date: string | null;
  note: string | null;
  created_at: string;
}

export interface SalaryHistoryRow {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  payment_type: "fijo" | "por_proyecto" | "por_hora" | "mixto";
  effective_from: string;
  end_date: string | null;
  note: string | null;
  created_at: string;
}

export type MilestoneKind =
  | "formacion"
  | "viaje"
  | "premio"
  | "promocion"
  | "otro";

export interface MilestoneRow {
  id: string;
  user_id: string;
  kind: MilestoneKind;
  title: string;
  description: string | null;
  date: string;
  created_by: string | null;
  created_at: string;
}

// ============ POSITION_HISTORY ============

export async function listPositionHistory(
  userId: string,
): Promise<PositionHistoryRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("position_history")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  if (error) {
    console.error("listPositionHistory:", error);
    return [];
  }
  return (data ?? []) as PositionHistoryRow[];
}

export async function addPositionHistory(
  input: Omit<PositionHistoryRow, "id" | "created_at">,
): Promise<PositionHistoryRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("position_history")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as PositionHistoryRow;
}

export async function deletePositionHistory(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("position_history")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ============ SALARY_HISTORY ============

export async function listSalaryHistory(
  userId: string,
): Promise<SalaryHistoryRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("salary_history")
    .select("*")
    .eq("user_id", userId)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("listSalaryHistory:", error);
    return [];
  }
  return (data ?? []) as SalaryHistoryRow[];
}

export async function addSalaryHistory(
  input: Omit<SalaryHistoryRow, "id" | "created_at">,
): Promise<SalaryHistoryRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("salary_history")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as SalaryHistoryRow;
}

export async function deleteSalaryHistory(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("salary_history")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ============ TEAM_MILESTONES ============

export async function listMilestones(
  userId: string,
): Promise<MilestoneRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("team_milestones")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (error) {
    console.error("listMilestones:", error);
    return [];
  }
  return (data ?? []) as MilestoneRow[];
}

export async function addMilestone(
  input: Omit<MilestoneRow, "id" | "created_at" | "created_by">,
): Promise<MilestoneRow | null> {
  const supabase = getSupabase();
  // created_by se setea con auth.uid() en DB? No, lo seteamos acá
  // tomando el user actual.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("team_milestones")
    .insert({ ...input, created_by: user?.id ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return data as MilestoneRow;
}

export async function deleteMilestone(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("team_milestones")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  formacion: "Formación",
  viaje: "Viaje",
  premio: "Premio",
  promocion: "Promoción",
  otro: "Otro",
};
