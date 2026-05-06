/**
 * GET /api/portal/kpi-history?months=12
 *
 * Devuelve los últimos N meses de snapshots de KPIs del cliente.
 * El cliente solo ve sus propios snapshots (RLS de migration 016).
 *
 * Response: {
 *   snapshots: [{ month: "YYYY-MM", kpis: {...}, captured_at }]
 * }
 *
 * El frontend se encarga de extraer el campo específico (roas, leads,
 * cac, conv) y normalizar a números.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface SnapshotRow {
  month: string;
  kpis: Record<string, unknown>;
  captured_at: string;
}

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json({ error: "Servidor no configurado." }, { status: 500 });
  }
  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const monthsParam = parseInt(req.nextUrl.searchParams.get("months") ?? "12", 10);
  const months = Math.max(1, Math.min(monthsParam, 24));

  const { data, error } = await supabase
    .from("kpi_snapshots")
    .select("month, kpis, captured_at")
    .order("month", { ascending: false })
    .limit(months);
  // RLS filtra por client_id del caller — no necesitamos filtrar en query.

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Devolvemos en orden cronológico ascendente para que el chart pinte
  // de izquierda (más viejo) a derecha (más reciente).
  const snapshots = ((data ?? []) as SnapshotRow[])
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month));

  return Response.json({ snapshots });
}
