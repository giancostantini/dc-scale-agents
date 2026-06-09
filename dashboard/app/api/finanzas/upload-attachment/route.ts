/**
 * POST /api/finanzas/upload-attachment
 *
 * Sube un comprobante (factura/recibo PDF/imagen) al bucket
 * 'finanzas-attachments' de Supabase Storage y devuelve la URL
 * pública.
 *
 * Body: multipart/form-data
 *   file: File
 *   kind: "income" | "expense"
 *
 * Solo director.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BUCKET = "finanzas-attachments";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
];

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

  // Auth director
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
  if (!caller) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json({ error: "Solo directores." }, { status: 403 });
  }

  // Multipart parse
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Body inválido (multipart)" }, { status: 400 });
  }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "").trim();
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!["income", "expense"].includes(kind)) {
    return Response.json(
      { error: "kind debe ser 'income' o 'expense'" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: `Archivo supera el límite de ${MAX_SIZE / 1024 / 1024} MB.` },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json(
      { error: `Tipo no permitido (${file.type}). Aceptados: PDF, JPG, PNG, WEBP, HEIC.` },
      { status: 400 },
    );
  }

  // Subida via service role (bypass RLS del bucket)
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const filename = `${kind}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(filename, new Uint8Array(buffer), {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    console.error("[upload-attachment] storage err:", uploadErr);
    return Response.json(
      {
        error:
          "No se pudo subir. ¿El bucket 'finanzas-attachments' existe en Storage?",
        detail: uploadErr.message,
      },
      { status: 500 },
    );
  }

  // URL pública. Para emails / preview rápido.
  const { data: publicUrlData } = admin.storage
    .from(BUCKET)
    .getPublicUrl(filename);

  return Response.json({
    success: true,
    url: publicUrlData.publicUrl,
    path: filename,
    size: file.size,
    type: file.type,
  });
}
