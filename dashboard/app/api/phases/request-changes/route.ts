/**
 * POST /api/phases/request-changes
 *
 * Marca un reporte como changes_requested guardando el feedback del
 * director. NO regenera automáticamente — el director ve el estado y
 * dispara "Regenerar" cuando quiere (eso llama /api/phases/generate
 * con el feedback en el body).
 *
 * Body:
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 *   feedback: string (no vacío)
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;

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

  let body: { clientId?: string; phase?: string; feedback?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const { clientId, phase, feedback } = body;

  if (!clientId || !phase || !feedback || !feedback.trim()) {
    return Response.json(
      { error: "Faltan clientId, phase o feedback." },
      { status: 400 },
    );
  }
  if (!(PHASES as readonly string[]).includes(phase)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: updErr } = await admin
    .from("phase_reports")
    .update({
      status: "changes_requested",
      feedback: feedback.trim(),
    })
    .eq("client_id", clientId)
    .eq("phase", phase);

  if (updErr) {
    return Response.json(
      { error: `No se pudo guardar el feedback: ${updErr.message}` },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}
