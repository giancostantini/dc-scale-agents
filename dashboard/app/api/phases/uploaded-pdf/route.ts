/**
 * GET /api/phases/uploaded-pdf?clientId=X&phase=Y&version=N
 *
 * Devuelve una signed URL del PDF subido por el director para esa
 * versión del reporte. Si `version` no se especifica, usa la versión
 * actual. Si no hay PDF subido, 404.
 *
 * El director y el cliente del cliente_id pueden leer este endpoint.
 *
 * Output:
 *   { signedUrl: string, pdfPath: string, version: number }
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;
const STORAGE_BUCKET = "client-onboarding";
const SIGNED_URL_TTL = 60 * 30; // 30 min

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  // Auth: director o el cliente del propio cliente_id
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
    .select("role, client_id")
    .eq("id", caller.id)
    .maybeSingle();

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("clientId");
  const phase = sp.get("phase");
  const versionStr = sp.get("version");
  if (!clientId || !phase) {
    return Response.json(
      { error: "Faltan clientId o phase" },
      { status: 400 },
    );
  }
  if (!(PHASES as readonly string[]).includes(phase)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }

  // Autorización: director, o cliente del mismo cliente_id
  const isDirector = callerProfile?.role === "director";
  const isOwnClient =
    callerProfile?.role === "client" && callerProfile?.client_id === clientId;
  if (!isDirector && !isOwnClient) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Buscar la versión: actual o de history
  let pdfPath: string | null = null;
  let version: number | null = null;

  if (versionStr) {
    const reqVer = parseInt(versionStr, 10);
    if (!Number.isFinite(reqVer)) {
      return Response.json({ error: "version inválida" }, { status: 400 });
    }
    // Mirar en current primero
    const { data: cur } = await admin
      .from("phase_reports")
      .select("version, pdf_path")
      .eq("client_id", clientId)
      .eq("phase", phase)
      .maybeSingle();
    if (cur?.version === reqVer) {
      pdfPath = cur.pdf_path ?? null;
      version = cur.version;
    } else {
      const { data: hist } = await admin
        .from("phase_report_history")
        .select("version, pdf_path")
        .eq("client_id", clientId)
        .eq("phase", phase)
        .eq("version", reqVer)
        .maybeSingle();
      pdfPath = hist?.pdf_path ?? null;
      version = hist?.version ?? null;
    }
  } else {
    const { data: cur } = await admin
      .from("phase_reports")
      .select("version, pdf_path")
      .eq("client_id", clientId)
      .eq("phase", phase)
      .maybeSingle();
    pdfPath = cur?.pdf_path ?? null;
    version = cur?.version ?? null;
  }

  if (!pdfPath) {
    return Response.json(
      { error: "Esta versión no tiene PDF subido (se genera desde markdown)." },
      { status: 404 },
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(pdfPath, SIGNED_URL_TTL);

  if (signErr || !signed?.signedUrl) {
    return Response.json(
      {
        error: `No se pudo generar URL: ${signErr?.message ?? "error desconocido"}`,
      },
      { status: 500 },
    );
  }

  return Response.json({
    signedUrl: signed.signedUrl,
    pdfPath,
    version,
  });
}
