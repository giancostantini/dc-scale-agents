"use client";

import { getSupabase } from "./client";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: "director" | "team";
  initials: string;
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
    .select("id, email, name, role, initials")
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
