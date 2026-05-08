/**
 * GET /api/phases/versions/content?clientId=X&phase=Y&version=N
 *
 * Devuelve el content_md de una versión específica del reporte
 * (sea la actual o una histórica). Se separa de /versions porque
 * el contenido pesa kilos y solo se trae cuando el director quiere
 * comparar dos versiones puntuales.
 *
 * Solo director.
 *
 * Output:
 *   {
 *     version: number,
 *     content_md: string,
 *     generated_at: string,
 *     feedback: string | null,
 *     isCurrent: boolean
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
  const versionStr = sp.get("version");
  if (!clientId || !phase || !versionStr) {
    return Response.json(
      { error: "Faltan clientId, phase o version" },
      { status: 400 },
    );
  }
  if (!(PHASES as readonly string[]).includes(phase)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }
  const version = parseInt(versionStr, 10);
  if (!Number.isFinite(version) || version < 1) {
    return Response.json({ error: "version inválida" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Primero buscar en el current — si la version pedida coincide con
  // la última, viene de phase_reports. Si no, viene del history.
  const { data: current } = await admin
    .from("phase_reports")
    .select("version, content_md, generated_at, feedback")
    .eq("client_id", clientId)
    .eq("phase", phase)
    .maybeSingle();

  if (current?.version === version && current.content_md) {
    return Response.json({
      version: current.version,
      content_md: current.content_md,
      generated_at: current.generated_at ?? "",
      feedback: current.feedback ?? null,
      isCurrent: true,
    });
  }

  const { data: histRow, error: histErr } = await admin
    .from("phase_report_history")
    .select("version, content_md, generated_at, feedback")
    .eq("client_id", clientId)
    .eq("phase", phase)
    .eq("version", version)
    .maybeSingle();

  if (histErr || !histRow) {
    return Response.json(
      { error: `Versión v${version} no encontrada` },
      { status: 404 },
    );
  }

  return Response.json({
    version: histRow.version,
    content_md: histRow.content_md,
    generated_at: histRow.generated_at,
    feedback: histRow.feedback ?? null,
    isCurrent: false,
  });
}
