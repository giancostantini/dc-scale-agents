// ==================== TEAM REQUESTS ====================
// Pedidos que el miembro del equipo le hace al director:
// ausencia, licencia, proyecto de innovación, otros.

import { getSupabase } from "./supabase/client";

export type TeamRequestKind =
  | "ausencia"
  | "licencia"
  | "innovacion"
  | "otro";

export type TeamRequestStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected";

export interface TeamRequest {
  id: string;
  user_id: string;
  kind: TeamRequestKind;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: TeamRequestStatus;
  director_response: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const TEAM_REQUEST_LABELS: Record<TeamRequestKind, string> = {
  ausencia: "Ausencia",
  licencia: "Licencia",
  innovacion: "Proyecto de innovación",
  otro: "Otro",
};

export const TEAM_REQUEST_STATUS_LABELS: Record<TeamRequestStatus, string> = {
  pending: "Pendiente",
  in_review: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
};

export async function listMyRequests(): Promise<TeamRequest[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("team_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listMyRequests:", error);
    return [];
  }
  return (data ?? []) as TeamRequest[];
}

/** Lista todos los requests pendientes (para directores). */
export async function listPendingRequests(): Promise<TeamRequest[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("team_requests")
    .select("*")
    .in("status", ["pending", "in_review"])
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listPendingRequests:", error);
    return [];
  }
  return (data ?? []) as TeamRequest[];
}

/** Lista TODOS los requests (director). */
export async function listAllRequests(): Promise<TeamRequest[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("team_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listAllRequests:", error);
    return [];
  }
  return (data ?? []) as TeamRequest[];
}

export interface CreateRequestInput {
  kind: TeamRequestKind;
  title: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

/** Crea un request del usuario actual (RLS valida user_id=auth.uid()). */
export async function createMyRequest(
  input: CreateRequestInput,
): Promise<TeamRequest> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sin sesión");
  const { data, error } = await supabase
    .from("team_requests")
    .insert({
      user_id: user.id,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TeamRequest;
}

/** Director resuelve un request: cambia status + agrega response. */
export async function resolveRequest(
  id: string,
  patch: {
    status: TeamRequestStatus;
    director_response?: string | null;
  },
): Promise<TeamRequest> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("team_requests")
    .update({
      status: patch.status,
      director_response: patch.director_response ?? null,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TeamRequest;
}

/** El creador puede cancelar/borrar su request si todavía está pending. */
export async function deleteRequest(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("team_requests")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
