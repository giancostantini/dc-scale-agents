/**
 * POST /api/phases/replace-pdf
 *
 * Reemplaza el PDF subido actual de una fase con un nuevo blob.
 * Se usa cuando el director aprueba y el cliente sella el PDF
 * con "Aprobado" sobre "Borrador" en la carátula.
 *
 * No modifica el content_md ni la version — es una mera operación
 * de archivo sobre el storage. Sobre-escribe el path actual.
 *
 * Body (multipart/form-data):
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 *   file:     File (.pdf)
 *
 * Solo director.
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;
const STORAGE_BUCKET = "client-onboarding";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) return Response.json({ error: "Sin sesión" }, { status: 401 });

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json({ error: "Solo directores" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const clientId = formData.get("clientId");
  const phase = formData.get("phase");
  const file = formData.get("file");

  if (typeof clientId !== "string" || typeof phase !== "string") {
    return Response.json({ error: "Faltan clientId o phase" }, { status: 400 });
  }
  if (!(PHASES as readonly string[]).includes(phase)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: `Archivo inválido (size: ${file.size})` },
      { status: 400 },
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Solo permitir reemplazar si ya hay un pdf_path para esta fase
  const { data: current } = await admin
    .from("phase_reports")
    .select("pdf_path")
    .eq("client_id", clientId)
    .eq("phase", phase)
    .maybeSingle();
  if (!current?.pdf_path) {
    return Response.json(
      { error: "No hay PDF previo para reemplazar." },
      { status: 404 },
    );
  }

  // Subir el nuevo PDF sobreescribiendo el mismo path
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(current.pdf_path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) {
    return Response.json(
      { error: `No se pudo reemplazar el PDF: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    pdfPath: current.pdf_path,
    sizeBytes: file.size,
  });
}
