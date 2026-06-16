"use client";

import { getSupabase } from "./client";

export type UserRole = "director" | "team" | "client";

export interface ProfilePermissions {
  /** Si true, el team member ve el módulo Pipeline (CRM). Default false. */
  pipeline_access?: boolean;
  /** Si true, el cliente ya vio el onboarding tour del portal. Solo role='client'. */
  tour_seen?: boolean;
  /** Si true, el team member tiene CONTROL TOTAL del menú Contenido del
   *  cliente (edición de piezas, aprobar/desaprobar, eliminar). Sin esto,
   *  team es solo lectura. El director siempre tiene control total
   *  independiente de este flag. Se setea desde /equipo/[id]. */
  content_admin?: boolean;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  initials: string;
  // Campos del equipo (migration 004) — opcionales hasta que el
  // director los completa desde /equipo.
  position?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
  payment_type?:
    | "fijo"
    | "por_proyecto"
    | "por_hora"
    | "por_cliente"
    | "mixto"
    | null;
  /** Día del mes (1-31) en que se le paga al funcional. NULL = sin
   *  día configurado. Usado en Finanzas/Funcionales para calcular
   *  próximos pagos. */
  payment_day?: number | null;
  start_date?: string | null;
  phone?: string | null;
  notes?: string | null;
  // Migration 007:
  client_id?: string | null;     // solo si role='client'
  permissions?: ProfilePermissions | null;
  // Migration 024: jerarquía organizacional
  reports_to_id?: string | null;
  // Migración 047: preferencias granulares de email (mayormente
  // usado por team / director). Para clientes solo aplican
  // email_on_task_assigned y weekly_digest_enabled — el resto se
  // oculta del UI en /perfil.
  email_on_new_request?: boolean;
  email_on_task_assigned?: boolean;
  email_on_client_assigned?: boolean;
  email_on_payment_received?: boolean;
  email_on_content_approved?: boolean;
  // Migración 017: newsletter / reporte de tendencias semanal.
  // Opt-in por default. Si el cliente lo apaga, no recibe ni el
  // digest ni el envío manual de tendencias (también respeta a
  // los contactos del cliente — si el portal user opta-out, no se
  // manda a nadie del cliente).
  weekly_digest_enabled?: boolean;
  // Migración 047: integración Outlook
  outlook_email?: string | null;
  outlook_connected_at?: string | null;
  // Migración 051: foto de perfil. Public URL del bucket "avatars".
  // Si está vacía, el UI cae a las iniciales coloreadas (default).
  avatar_url?: string | null;
  // Migración 072: cliente recién creado con password aleatoria — el
  // gate del portal lo redirige a /portal/cambiar-password hasta que
  // elija una propia. Se limpia automáticamente cuando el endpoint
  // /api/portal/change-password completa.
  must_change_password?: boolean;
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
  /** Lista de keys del catálogo CLIENT_MENUS_GP/DEV (lib/client-menus)
   *  que este miembro puede ver en el sidebar del cliente. NULL =
   *  ver todos los menús (default, backward-compatible). */
  visible_menus?: string[] | null;
}

// ==================== ROLE HELPERS (client-side) ====================
// Estos helpers reflejan las funciones SECURITY DEFINER del DB
// (auth_role, auth_client_id, etc) pero del lado cliente para guardar
// y filtrar UI. La autoridad sigue siendo la DB vía RLS.

export function isDirector(profile: Profile | null | undefined): boolean {
  return profile?.role === "director";
}

export function isTeam(profile: Profile | null | undefined): boolean {
  return profile?.role === "team";
}

export function isClient(profile: Profile | null | undefined): boolean {
  return profile?.role === "client";
}

export function hasPipelineAccess(
  profile: Profile | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.role === "director") return true;
  if (profile.role === "team") {
    return profile.permissions?.pipeline_access === true;
  }
  return false;
}

export function hasFinanzasAccess(
  profile: Profile | null | undefined,
): boolean {
  return profile?.role === "director";
}

/**
 * Puede el viewer editar piezas en /cliente/[id]/contenido?
 *   - Director: siempre.
 *   - Team con permissions.content_admin === true: sí, en cualquier cliente.
 *   - Team SIN content_admin pero el cliente es GP (tipo "gp"): SÍ. El
 *     director decidió que todo el equipo puede colaborar en la edición
 *     de contenido de los clientes Growth — esos viven de cadencia
 *     editorial y necesitan que cualquiera pueda corregir un copy
 *     sin estar pidiendo permisos. Para clientes DEV mantenemos la
 *     restricción de content_admin porque son sitios/landings y la
 *     edición ahí impacta el código publicado.
 *   - Cliente: nunca (su edición vive en el portal vía recomendaciones).
 *
 * Se usa para mostrar/ocultar botones de aprobar, desaprobar, eliminar,
 * editar inline y para enable de los inputs del RowEditor en /contenido.
 *
 * `clientType` es opcional: si no se pasa, mantenemos la semántica
 * vieja (solo content_admin para team). Los call sites que sí saben
 * del cliente actual (la página /contenido siempre lo sabe) lo pasan
 * para habilitar el branch GP-friendly.
 */
export function canEditContent(
  profile: Profile | null | undefined,
  clientType?: "gp" | "dev" | null,
): boolean {
  if (!profile) return false;
  if (profile.role === "director") return true;
  if (profile.role === "team") {
    if (profile.permissions?.content_admin === true) return true;
    if (clientType === "gp") return true;
    return false;
  }
  return false;
}

/** A dónde redirigir después de login según el rol. */
export function homeForRole(profile: Profile | null | undefined): string {
  if (!profile) return "/";
  if (profile.role === "client") return "/portal";
  return "/hub";
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
      "id, email, name, role, initials, position, payment_amount, payment_currency, payment_type, payment_day, start_date, phone, notes, client_id, permissions, reports_to_id, avatar_url, must_change_password, email_on_task_assigned, weekly_digest_enabled",
    )
    .eq("id", user.id)
    .single();

  if (error || !data) {
    // El SELECT principal falló (típicamente porque una columna nueva
    // no existe — migración pendiente). En vez de inventar un fallback
    // como "team" — que oculta menús al director silenciosamente —
    // hacemos un SELECT mínimo con columnas garantizadas y devolvemos
    // ese. Si TAMBIÉN falla, recién ahí usamos el fallback team.
    console.warn(
      "[getCurrentProfile] SELECT principal falló:",
      error?.message,
    );
    const { data: fallbackData } = await supabase
      .from("profiles")
      .select("id, email, name, role, initials")
      .eq("id", user.id)
      .single();
    if (fallbackData) {
      return fallbackData as Profile;
    }
    // Último recurso: profile no existe en absoluto.
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
