"use client";

import { getSupabase } from "./client";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: "director" | "team";
  initials: string;
  // Campos del equipo (migration 004) — opcionales hasta que el
  // director los completa desde /equipo.
  position?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
  payment_type?: "fijo" | "por_proyecto" | "por_hora" | "mixto" | null;
  start_date?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export type TeamPosition =
  | "Director"
  | "Account Lead"
  | "Paid Media Lead"
  | "Content Lead"
  | "Dev Lead"
  | "Strategy"
  | "Diseño"
  | "Asistente";

export const TEAM_POSITIONS: TeamPosition[] = [
  "Director",
  "Account Lead",
  "Paid Media Lead",
  "Content Lead",
  "Dev Lead",
  "Strategy",
  "Diseño",
  "Asistente",
];

// Roles que se pueden asignar a un usuario en un cliente específico
// (puede ser distinto al `position` general del usuario).
export const CLIENT_ROLES: string[] = [
  "Account Lead",
  "Paid Media Lead",
  "Content Lead",
  "Dev Lead",
  "Strategy",
  "Diseño",
  "QA",
  "Asistente",
];

export interface ClientAssignment {
  client_id: string;
  user_id: string;
  role_in_client: string;
  since: string;
  until?: string | null;
  notes?: string | null;
  created_at: string;
}

/**
 * Retorna el usuario autenticado actual + su profile, o null si no hay sesión.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, name, role, initials, position, payment_amount, payment_currency, payment_type, start_date, phone, notes",
    )
    .eq("id", user.id)
    .single();

  if (error || !data) {
    // Fallback: el trigger debería haber creado el profile, pero por si falla
    return {
      id: user.id,
      email: user.email ?? "",
      name: user.email?.split("@")[0] ?? "Usuario",
      role: "team",
      initials: (user.email?.slice(0, 2) ?? "??").toUpperCase(),
    };
  }

  return data as Profile;
}

/**
 * Login con email y contraseña.
 */
export async function signIn(email: string, password: string) {
  const supabase = getSupabase();
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Logout + limpieza de sesión.
 */
export async function signOut() {
  const supabase = getSupabase();
  return supabase.auth.signOut();
}

/**
 * True si hay sesión activa.
 */
export async function hasSession(): Promise<boolean> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return !!session;
}
