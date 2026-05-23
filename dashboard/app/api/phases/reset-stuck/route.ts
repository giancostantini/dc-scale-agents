/**
 * POST /api/phases/reset-stuck
 *
 * Destraba un reporte de fase que quedó colgado en status='generating'.
 *
 * Por qué existe: si la función de Vercel se mata por timeout antes de
 * que termine la llamada a Claude, el row queda en 'generating' para
 * siempre. La UI muestra "Generando con Claude…" indefinidamente.
 * Este endpoint lo resetea a 'pending' (o 'draft' si ya hay content_md
 * guardado de una versión anterior).
 *
 * Solo director. Solo destraba si el row lleva ≥ 5 min en 'generating'
 * — sirve como salvaguarda para no abortar generaciones que están
 * legítimamente corriendo todavía.
 *
 * Body:
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 *   force?:   boolean — si true, ignora el umbral de 5 min.
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { logAction } from "@/lib/audit";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;

// Si lleva más de este tiempo en 'generating' lo consideramos colgado.
// La llamada real a Claude no debería pasar de 4-5 min con el modelo
// y prompts actuales, así que 5 min es un threshold seguro.
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  const callerToken = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json({ error: "Solo directores." }, { status: 403 });
  }

  let body: { clientId?: string; phase?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const { clientId, phase, force } = body;

  if (!clientId || !phase) {
    return Response.json(
      { error: "Faltan clientId o phase." },
      { status: 400 },
    );
  }
  if (!(PHASES as readonly string[]).includes(phase)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: current, error: selErr } = await admin
    .from("phase_reports")
    .select("status, content_md, updated_at")
    .eq("client_id", clientId)
    .eq("phase", phase)
    .maybeSingle();

  if (selErr || !current) {
    return Response.json(
      { error: "No se encontró el reporte." },
      { status: 404 },
    );
  }

  if (current.status !== "generating") {
    return Response.json(
      { error: `El reporte no está colgado (status=${current.status}).` },
      { status: 400 },
    );
  }

  // Chequeo de umbral salvo que el director fuerce con force=true
  const updatedAt = new Date(current.updated_at ?? 0).getTime();
  const ageMs = Date.now() - updatedAt;
  if (!force && ageMs < STUCK_THRESHOLD_MS) {
    const remainingSec = Math.ceil((STUCK_THRESHOLD_MS - ageMs) / 1000);
    return Response.json(
      {
        error: `El reporte lleva ${Math.floor(ageMs / 1000)}s generando — todavía puede estar corriendo. Probá de nuevo en ${remainingSec}s o usá force=true.`,
      },
      { status: 400 },
    );
  }

  // Si ya hay content_md de una versión anterior, volvemos a 'draft' —
  // el director sigue viendo el contenido viejo. Si no, vamos a
  // 'pending' para que se vea el botón de "Generar".
  const newStatus = current.content_md ? "draft" : "pending";

  const { error: updErr } = await admin
    .from("phase_reports")
    .update({ status: newStatus })
    .eq("client_id", clientId)
    .eq("phase", phase);

  if (updErr) {
    return Response.json(
      { error: `No se pudo resetear: ${updErr.message}` },
      { status: 500 },
    );
  }

  await logAction({
    actorId: caller.id,
    actorEmail: caller.email ?? null,
    action: "phase.reset_stuck",
    targetType: "phase_report",
    targetId: `${clientId}:${phase}`,
    metadata: { ageMs, force: !!force, newStatus },
  });

  return Response.json({ success: true, newStatus, ageMs });
}
