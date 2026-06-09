/**
 * GET /api/portal/trends
 *
 * Devuelve las últimas tendencias del nicho del cliente autenticado. Lo
 * consumen <SectorTrendsCard /> (sidebar del portal) y la página
 * /portal/tendencias.
 *
 * `agent_outputs` NO tiene RLS por cliente → usamos service role y filtramos
 * por el client_id del caller (mismo patrón que /api/portal/team).
 *
 * Auth: Bearer del cliente (role='client', con client_id).
 *
 * Response:
 *   { items: TrendItem[], sources: {url,title}[], generatedAt, bodyMd, title }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface TrendItem {
  title: string;
  summary?: string;
  category?: string;
  sourceTitle?: string;
  sourceUrl?: string;
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

  // Última corrida de tendencias para este cliente
  const { data: output } = await admin
    .from("agent_outputs")
    .select("title, body_md, structured, created_at")
    .eq("client", clientId)
    .eq("output_type", "sector-trends")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!output) {
    return Response.json({
      items: [],
      sources: [],
      generatedAt: null,
      bodyMd: null,
      title: null,
    });
  }

  const structured = (output.structured ?? {}) as {
    items?: TrendItem[];
    sources?: { url: string; title: string }[];
    generatedAt?: string;
  };

  return Response.json({
    items: Array.isArray(structured.items) ? structured.items : [],
    sources: Array.isArray(structured.sources) ? structured.sources : [],
    generatedAt: structured.generatedAt ?? output.created_at ?? null,
    bodyMd: output.body_md ?? null,
    title: output.title ?? null,
  });
}
