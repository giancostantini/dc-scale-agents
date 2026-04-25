// ==================== TEAM / EQUIPO ====================
// Helpers para listar, leer, actualizar profiles y manejar las
// asignaciones cliente↔usuario. Las RLS se encargan de bloquear
// escrituras a no-directores; este file no replica esa lógica
// (confiamos en la DB como source of truth de permisos).

import { getSupabase } from "./supabase/client";
import type { Profile, ClientAssignment } from "./supabase/auth";

const PROFILE_COLS =
  "id, email, name, role, initials, position, payment_amount, payment_currency, payment_type, start_date, phone, notes";

// ============ PROFILES ============

export async function listProfiles(): Promise<Profile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .order("role", { ascending: false }) // director primero
    .order("name", { ascending: true });
  if (error) {
    console.error("listProfiles error:", error);
    return [];
  }
  return (data ?? []) as Profile[];
}

export async function getProfile(id: string): Promise<Profile | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

export interface UpdateProfileInput {
  name?: string;
  position?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
  payment_type?: Profile["payment_type"];
  start_date?: string | null;
  phone?: string | null;
  notes?: string | null;
  role?: Profile["role"];
  initials?: string;
}

export async function updateProfile(
  id: string,
  patch: UpdateProfileInput,
): Promise<Profile | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select(PROFILE_COLS)
    .single();
  if (error) throw error;
  return data as Profile;
}

// ============ CLIENT ASSIGNMENTS ============

export interface AssignmentInput {
  client_id: string;
  user_id: string;
  role_in_client: string;
  since?: string;
  until?: string | null;
  notes?: string | null;
}

export async function listAssignmentsForUser(
  userId: string,
): Promise<ClientAssignment[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_assignments")
    .select("*")
    .eq("user_id", userId);
  if (error) return [];
  return (data ?? []) as ClientAssignment[];
}

export async function listAssignmentsForClient(
  clientId: string,
): Promise<ClientAssignment[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_assignments")
    .select("*")
    .eq("client_id", clientId);
  if (error) return [];
  return (data ?? []) as ClientAssignment[];
}

export async function listAllAssignments(): Promise<ClientAssignment[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_assignments")
    .select("*");
  if (error) return [];
  return (data ?? []) as ClientAssignment[];
}

export async function addAssignment(input: AssignmentInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("client_assignments").insert({
    client_id: input.client_id,
    user_id: input.user_id,
    role_in_client: input.role_in_client,
    since: input.since ?? new Date().toISOString().slice(0, 10),
    until: input.until ?? null,
    notes: input.notes ?? null,
  });
  if (error) throw error;
}

export async function removeAssignment(
  clientId: string,
  userId: string,
  roleInClient: string,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("client_assignments")
    .delete()
    .eq("client_id", clientId)
    .eq("user_id", userId)
    .eq("role_in_client", roleInClient);
  if (error) throw error;
}

// ============ HELPERS ============

export function makeInitialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "??";
}
