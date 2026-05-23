/**
 * GET /api/portal/team
 *
 * Devuelve el equipo de D&C asignado al cliente autenticado. Lo consume
 * <TeamCard /> en el sidebar del portal.
 *
 * El cliente (role='client') NO puede leer client_assignments ni los
 * profiles del team por RLS — por eso este endpoint usa service role y
 * filtra a campos públicos (nada de pagos, notas, ni data interna).
 *
 * Auth: Bearer token del cliente (role='client', con client_id).
 *
 * Response:
 *   { team: { name, initials, roleInClient, phone, email }[] }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Orden de prioridad de roles (los primeros van arriba en la card)
const ROLE_PRIORITY: Record<string, number> = {
  "Account Lead": 0,
  Director: 1,
  "Paid Media Lead": 2,
  "Content Lead": 3,
  "Dev Lead": 4,
  Strategy: 5,
};

interface TeamMember {
  name: string;
  initials: string;
  roleInClient: string;
  phone: string | null;
  email: string | null;
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Sin sesión" }, { status: 401 });

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: authUser },
  } = await callerClient.auth.getUser();
  if (!authUser) return Response.json({ error: "No autenticado" }, { status: 401 });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, client_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile || profile.role !== "client" || !profile.client_id) {
    return Response.json(
      { error: "Este endpoint es solo para clientes finales." },
      { status: 403 },
    );
  }

  const clientId = profile.client_id as string;

  // 1. Assignments del cliente
  const { data: assignments } = await admin
    .from("client_assignments")
    .select("user_id, role_in_client")
    .eq("client_id", clientId);

  if (!assignments || assignments.length === 0) {
    return Response.json({ team: [] });
  }

  const userIds = assignments.map((a) => a.user_id as string);
  const roleByUser = new Map<string, string>(
    assignments.map((a) => [a.user_id as string, (a.role_in_client as string) ?? ""]),
  );

  // 2. Profiles de esos users — solo campos públicos
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, initials, position, phone, email")
    .in("id", userIds);

  const team: TeamMember[] = (profiles ?? []).map((p) => {
    const roleInClient =
      roleByUser.get(p.id as string) ||
      (p.position as string | null) ||
      "Equipo D&C";
    return {
      name: (p.name as string) ?? "—",
      initials: (p.initials as string) ?? "··",
      roleInClient,
      phone: (p.phone as string | null) ?? null,
      email: (p.email as string | null) ?? null,
    };
  });

  // 3. Ordenar por prioridad de rol
  team.sort((a, b) => {
    const pa = ROLE_PRIORITY[a.roleInClient] ?? 99;
    const pb = ROLE_PRIORITY[b.roleInClient] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return Response.json({ team });
}
