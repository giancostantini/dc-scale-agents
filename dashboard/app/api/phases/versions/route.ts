/**
 * GET /api/phases/versions?clientId=X&phase=Y
 *
 * Devuelve la lista de TODAS las versiones de un reporte de fase
 * (current + history), de la más nueva a la más vieja, sin el
 * content_md (para que no pese kilos cuando solo querés mostrar
 * un selector de versiones). Para traer el content de una versión
 * específica usá /api/phases/versions/content.
 *
 * Solo director.
 *
 * Output:
 *   {
 *     versions: [{
 *       version: number,
 *       generated_at: string,
 *       feedback: string | null,
 *       isCurrent: boolean
 *     }, ...]
 *   }
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
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
    return Response.json({ error: "Solo directores" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("clientId");
  const phase = sp.get("phase");
  if (!clientId || !phase) {
    return Response.json(
      { error: "Faltan clientId o phase" },
      { status: 400 },
    );
  }
  if (!(PHASES as readonly string[]).includes(phase)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Versión actual (la última, en phase_reports)
  const { data: current } = await admin
    .from("phase_reports")
    .select("version, generated_at, feedback, content_md")
    .eq("client_id", clientId)
    .eq("phase", phase)
    .maybeSingle();

  // Historial de versiones anteriores
  const { data: history, error: histErr } = await admin
    .from("phase_report_history")
    .select("version, generated_at, feedback")
    .eq("client_id", clientId)
    .eq("phase", phase)
    .order("version", { ascending: false });

  if (histErr) {
    return Response.json(
      { error: `No se pudo leer el historial: ${histErr.message}` },
      { status: 500 },
    );
  }

  type VersionEntry = {
    version: number;
    generated_at: string;
    feedback: string | null;
    isCurrent: boolean;
  };

  const versions: VersionEntry[] = [];

  if (current?.version && current?.content_md) {
    versions.push({
      version: current.version,
      generated_at: current.generated_at ?? "",
      feedback: current.feedback ?? null,
      isCurrent: true,
    });
  }

  for (const h of history ?? []) {
    versions.push({
      version: h.version,
      generated_at: h.generated_at,
      feedback: h.feedback ?? null,
      isCurrent: false,
    });
  }

  // De más nuevo a más viejo
  versions.sort((a, b) => b.version - a.version);

  return Response.json({ versions });
}
