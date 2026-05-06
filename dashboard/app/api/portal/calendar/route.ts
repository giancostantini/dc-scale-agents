/**
 * GET /api/portal/calendar?month=YYYY-MM
 *
 * Devuelve eventos del mes pedido para el cliente: reuniones,
 * lanzamientos de campañas y publicaciones de contenido. Combina
 * cal_events + production_campaigns + content_posts con etiquetas de
 * tipo distintas.
 *
 * Si no se pasa ?month, usa el mes actual.
 *
 * Response: {
 *   month: "YYYY-MM",
 *   events: [{ date, type: "meeting"|"campaign-start"|"campaign-end"|"content", title, ... }]
 * }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/consultant-context";

interface CalendarEvent {
  id: string;
  date: string;
  time?: string | null;
  type: "meeting" | "campaign-start" | "campaign-end" | "content";
  title: string;
  meta?: string;
  meetLink?: string | null;
  network?: string;
}

function monthRange(yearMonth: string): { from: string; until: string } {
  // Para month="YYYY-MM": from=YYYY-MM-01, until=YYYY-(MM+1)-01.
  // Usamos "<" en queries con until así no cuenta el día siguiente.
  const [yStr, mStr] = yearMonth.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const from = `${yearMonth}-01`;
  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY += 1;
  }
  const until = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { from, until };
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
    return Response.json({ error: "Solo clientes." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: "Servidor no configurado (service role)." },
      { status: 500 },
    );
  }

  const monthParam = req.nextUrl.searchParams.get("month");
  const fallbackMonth = new Date().toISOString().slice(0, 7);
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : fallbackMonth;
  const { from, until } = monthRange(month);

  const clientId = profile.client_id;

  const [
    { data: meetings },
    { data: campaigns },
    { data: posts },
  ] = await Promise.all([
    admin
      .from("cal_events")
      .select("id, title, date, time, type, meet_link")
      .eq("client_id", clientId)
      .gte("date", from)
      .lt("date", until)
      .order("date"),
    admin
      .from("production_campaigns")
      .select("id, title, type, start_date, end_date")
      .eq("client_id", clientId)
      .or(
        `and(start_date.gte.${from},start_date.lt.${until}),and(end_date.gte.${from},end_date.lt.${until})`,
      ),
    admin
      .from("content_posts")
      .select("id, network, format, brief, date")
      .eq("client_id", clientId)
      .gte("date", from)
      .lt("date", until)
      .order("date"),
  ]);

  const events: CalendarEvent[] = [];

  for (const m of meetings ?? []) {
    events.push({
      id: `meeting-${m.id}`,
      date: m.date,
      time: m.time,
      type: "meeting",
      title: m.title,
      meta: m.type ?? undefined,
      meetLink: m.meet_link,
    });
  }

  for (const c of campaigns ?? []) {
    if (c.start_date >= from && c.start_date < until) {
      events.push({
        id: `campaign-start-${c.id}`,
        date: c.start_date,
        type: "campaign-start",
        title: `Lanza: ${c.title}`,
        meta: c.type ?? undefined,
      });
    }
    if (c.end_date && c.end_date >= from && c.end_date < until) {
      events.push({
        id: `campaign-end-${c.id}`,
        date: c.end_date,
        type: "campaign-end",
        title: `Cierra: ${c.title}`,
        meta: c.type ?? undefined,
      });
    }
  }

  for (const p of posts ?? []) {
    events.push({
      id: `content-${p.id}`,
      date: p.date,
      type: "content",
      title: p.brief ? p.brief.slice(0, 60) : p.format ?? "Post",
      meta: p.format ?? undefined,
      network: p.network,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return Response.json({ month, events });
}
