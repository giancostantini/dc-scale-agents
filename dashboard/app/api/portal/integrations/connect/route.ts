/**
 * POST /api/portal/integrations/connect
 *
 * El cliente (role='client') guarda credenciales/IDs de una integración
 * desde el modal de /portal/conexiones. El endpoint:
 *
 *   1. Valida que el caller sea cliente con client_id.
 *   2. Valida que la integration `key` exista y los campos required
 *      del tutorial estén presentes.
 *   3. Hace UPDATE a `integrations` (RLS de migration 014 lo permite).
 *   4. El trigger SQL `audit_integration_update` se encarga de:
 *        - Insertar en audit_log con action='client.integration_updated'
 *        - Notificar al equipo (notifications.to_role='team')
 *
 * Body:
 *   { key: string, credentials: Record<string, string> }
 *
 * Response:
 *   { ok: true } | { error: string }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTutorial } from "@/lib/integration-tutorials";

interface ConnectBody {
  key?: string;
  credentials?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  // Auth: el cliente debe estar logueado
  const callerToken = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id")
    .eq("id", caller.id)
    .maybeSingle();

  if (!profile || profile.role !== "client" || !profile.client_id) {
    return Response.json(
      { error: "Solo clientes pueden cargar conexiones desde el portal." },
      { status: 403 },
    );
  }

  let body: ConnectBody;
  try {
    body = (await req.json()) as ConnectBody;
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const { key, credentials } = body;
  if (!key || typeof key !== "string") {
    return Response.json({ error: "Falta key" }, { status: 400 });
  }
  if (!credentials || typeof credentials !== "object") {
    return Response.json({ error: "Falta credentials" }, { status: 400 });
  }

  // Validar contra el tutorial
  const tutorial = getTutorial(key);
  const missing = tutorial.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = credentials[f.key];
      return typeof v !== "string" || v.trim().length === 0;
    })
    .map((f) => f.label);

  if (missing.length > 0) {
    return Response.json(
      { error: `Faltan campos requeridos: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // Sanitizar: keep solo strings, trim values
  const cleanCreds: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    if (typeof v === "string" && v.trim().length > 0) {
      cleanCreds[k] = v.trim();
    }
  }

  // UPDATE — la RLS de migration 014 permite que el cliente actualice
  // sus propias filas. El trigger audit_integration_update se encarga
  // de loguear y notificar al team.
  const { data: existing } = await supabase
    .from("integrations")
    .select("id, key")
    .eq("client_id", profile.client_id)
    .eq("key", key)
    .maybeSingle();

  if (!existing) {
    return Response.json(
      {
        error:
          "Esta integración aún no está habilitada para tu cuenta. Avisale a tu account lead.",
      },
      { status: 404 },
    );
  }

  const { error: updateErr } = await supabase
    .from("integrations")
    .update({
      credentials: cleanCreds,
      status: "connected",
      submitted_by: caller.id,
      submitted_at: new Date().toISOString(),
    })
    .eq("client_id", profile.client_id)
    .eq("key", key);

  if (updateErr) {
    return Response.json(
      { error: `No pude guardar: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
