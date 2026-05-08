/**
 * GET  /api/portal/consultant/conversations
 *   → lista conversaciones del cliente caller, ordenadas por updated_at DESC.
 *     Devuelve { conversations: [{ id, title, updated_at, message_count }] }
 *
 * POST /api/portal/consultant/conversations
 *   → crea una nueva conversación para el cliente caller.
 *     Body opcional: { title?: string }.
 *     Devuelve { id, title, created_at }.
 *
 * Auth: cliente autenticado con role='client' y client_id válido.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/consultant-context";

interface ConversationRow {
  id: string;
  title: string | null;
  updated_at: string;
}

async function authenticateClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: Response.json({ error: "Servidor no configurado." }, { status: 500 }) };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: Response.json({ error: "Servidor no configurado (service role key)." }, { status: 500 }) };
  }

  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) {
    return { error: Response.json({ error: "Sin sesión" }, { status: 401 }) };
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) {
    return { error: Response.json({ error: "No autenticado" }, { status: 401 }) };
  }

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role, client_id")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== "client" || !callerProfile.client_id) {
    return {
      error: Response.json(
        { error: "Solo clientes finales pueden gestionar conversaciones del Consultor." },
        { status: 403 },
      ),
    };
  }

  return { admin, callerId: caller.id, clientId: callerProfile.client_id as string };
}

export async function GET(req: NextRequest) {
  const auth = await authenticateClient(req);
  if ("error" in auth) return auth.error;

  const { admin, clientId } = auth;

  const { data: conversations, error: convErr } = await admin
    .from("consultant_conversations")
    .select("id, title, updated_at")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (convErr) {
    console.error("conversations GET error:", convErr);
    return Response.json({ error: "Error cargando conversaciones." }, { status: 500 });
  }

  const ids = (conversations ?? []).map((c: ConversationRow) => c.id);
  let counts: Record<string, number> = {};

  if (ids.length > 0) {
    // Conteo de mensajes por conversación. Usa una sola query agrupada.
    const { data: msgs } = await admin
      .from("consultant_messages")
      .select("conversation_id")
      .in("conversation_id", ids);

    counts = (msgs ?? []).reduce<Record<string, number>>((acc, row) => {
      const cid = (row as { conversation_id: string }).conversation_id;
      acc[cid] = (acc[cid] ?? 0) + 1;
      return acc;
    }, {});
  }

  return Response.json({
    conversations: (conversations ?? []).map((c: ConversationRow) => ({
      id: c.id,
      title: c.title,
      updated_at: c.updated_at,
      message_count: counts[c.id] ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateClient(req);
  if ("error" in auth) return auth.error;

  const { admin, callerId, clientId } = auth;

  let body: { title?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { title?: string };
  } catch {
    body = {};
  }

  const title = body.title?.trim() || null;

  const { data, error } = await admin
    .from("consultant_conversations")
    .insert({
      client_id: clientId,
      user_id: callerId,
      title,
    })
    .select("id, title, created_at")
    .single();

  if (error || !data) {
    console.error("conversations POST error:", error);
    return Response.json({ error: "No pude crear la conversación." }, { status: 500 });
  }

  return Response.json(data);
}
