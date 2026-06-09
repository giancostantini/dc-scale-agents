/**
 * GET /api/trends/consolidated
 *
 * Consolidado de tendencias de TODOS los clientes Growth Partner activos, para
 * el dashboard INTERNO de D&C. Solo lo pueden leer director o team (no client).
 * Lo consume la página interna /tendencias.
 *
 * Reusa getLatestSectorTrendsByClient() (service role). Acá solo validamos el
 * rol del caller antes de devolver el consolidado.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLatestSectorTrendsByClient } from "@/lib/sector-trends";

export const dynamic = "force-dynamic";

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
    .select("role")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile || (profile.role !== "director" && profile.role !== "team")) {
    return Response.json(
      { error: "Este endpoint es solo para el equipo de D&C." },
      { status: 403 },
    );
  }

  const clients = await getLatestSectorTrendsByClient();
  return Response.json({ clients });
}
