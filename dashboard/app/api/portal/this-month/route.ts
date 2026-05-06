/**
 * GET /api/portal/this-month
 *
 * Devuelve el resumen del trabajo del equipo para el cliente en el
 * mes actual. Hace 6 queries en paralelo agrupando por client_id +
 * filtrando por timestamp >= primer día del mes.
 *
 * Si querés un rango distinto (ej. "últimos 7 días" para el digest
 * semanal), aceptamos ?since=YYYY-MM-DD opcional.
 *
 * Response: {
 *   period: { from: "YYYY-MM-DD", until: "YYYY-MM-DD", label: "mayo 2026" },
 *   counts: { contentPosts, campaigns, reports, meetings, requestsResolved, agentRuns },
 *   highlights: { lastPosts, lastMeetings, lastReports, lastResolvedRequests }
 * }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/consultant-context";

interface PostHighlight {
  id: string;
  network: string;
  format: string | null;
  brief: string | null;
  date: string;
}
interface MeetingHighlight {
  id: string;
  title: string;
  date: string;
  time: string | null;
  type: string;
}
interface ReportHighlight {
  phase: string;
  approved_at: string;
}
interface RequestHighlight {
  id: string;
  type: string;
  title: string;
  status: string;
  updated_at: string;
}

const MONTH_LABEL_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

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

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await callerClient
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "client" || !profile.client_id) {
    return Response.json(
      { error: "Solo clientes pueden usar este endpoint." },
      { status: 403 },
    );
  }

  const clientId = profile.client_id;
  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: "Servidor no configurado (service role)." },
      { status: 500 },
    );
  }

  // Calcular rango: por defecto desde el día 1 del mes actual hasta hoy.
  // Si llega ?since=YYYY-MM-DD, usar esa fecha como inicio.
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ?? `${todayIso.slice(0, 7)}-01`;
  const sinceTimestamp = `${since}T00:00:00.000Z`;
  const yearMonth = since.slice(0, 7); // YYYY-MM
  const monthNumber = parseInt(yearMonth.slice(5, 7), 10) - 1;
  const periodLabel = `${MONTH_LABEL_ES[monthNumber] ?? ""} ${yearMonth.slice(0, 4)}`;

  const [
    { count: postsCount, data: posts },
    { count: campaignsCount },
    { count: reportsCount, data: reports },
    { count: meetingsCount, data: meetings },
    { count: requestsCount, data: requestsResolved },
    { count: agentRunsCount },
  ] = await Promise.all([
    admin
      .from("content_posts")
      .select("id, network, format, brief, date", { count: "exact" })
      .eq("client_id", clientId)
      .eq("status", "published")
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(3),
    admin
      .from("production_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("start_date", since),
    admin
      .from("phase_reports")
      .select("phase, approved_at", { count: "exact" })
      .eq("client_id", clientId)
      .eq("status", "approved")
      .gte("approved_at", sinceTimestamp)
      .order("approved_at", { ascending: false })
      .limit(3),
    admin
      .from("cal_events")
      .select("id, title, date, time, type", { count: "exact" })
      .eq("client_id", clientId)
      .gte("date", since)
      .lte("date", todayIso)
      .order("date", { ascending: false })
      .limit(2),
    admin
      .from("client_requests")
      .select("id, type, title, status, updated_at", { count: "exact" })
      .eq("client_id", clientId)
      .gte("updated_at", sinceTimestamp)
      .in("status", ["done", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(3),
    admin
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("client", clientId)
      .eq("status", "success")
      .gte("created_at", sinceTimestamp),
  ]);

  return Response.json({
    period: {
      from: since,
      until: todayIso,
      label: periodLabel,
    },
    counts: {
      contentPosts: postsCount ?? 0,
      campaigns: campaignsCount ?? 0,
      reports: reportsCount ?? 0,
      meetings: meetingsCount ?? 0,
      requestsResolved: requestsCount ?? 0,
      agentRuns: agentRunsCount ?? 0,
    },
    highlights: {
      lastPosts: (posts ?? []) as PostHighlight[],
      lastMeetings: (meetings ?? []) as MeetingHighlight[],
      lastReports: (reports ?? []) as ReportHighlight[],
      lastResolvedRequests: (requestsResolved ?? []) as RequestHighlight[],
    },
  });
}
