/**
 * GET   /api/portal/consultant/conversations/[id]
 *   → devuelve { conversation, messages: [...] } ordenados ASC.
 *
 * PATCH /api/portal/consultant/conversations/[id]
 *   → renombra el título. Body: { title: string }.
 *
 * Auth: cliente con role='client'. RLS del padre garantiza que solo
 *   accede a conversaciones de su propio client_id.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/consultant-context";

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  is_welcome: boolean;
  created_at: string;
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

  return { admin, clientId: callerProfile.client_id as string };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateClient(req);
  if ("error" in auth) return auth.error;

  const { admin, clientId } = auth;
  const { id } = await params;

  const { data: conversation, error: convErr } = await admin
    .from("consultant_conversations")
    .select("id, client_id, title, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (convErr) {
    console.error("conversation GET error:", convErr);
    return Response.json({ error: "Error cargando la conversación." }, { status: 500 });
  }
  if (!conversation || conversation.client_id !== clientId) {
    return Response.json({ error: "Conversación no encontrada." }, { status: 404 });
  }

  const { data: messages, error: msgsErr } = await admin
    .from("consultant_messages")
    .select("id, role, content, is_welcome, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (msgsErr) {
    console.error("messages GET error:", msgsErr);
    return Response.json({ error: "Error cargando mensajes." }, { status: 500 });
  }

  return Response.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    },
    messages: (messages ?? []) as MessageRow[],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateClient(req);
  if ("error" in auth) return auth.error;

  const { admin, clientId } = auth;
  const { id } = await params;

  let body: { title?: string };
  try {
    body = (await req.json()) as { title?: string };
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return Response.json({ error: "Falta title" }, { status: 400 });
  }
  if (title.length > 200) {
    return Response.json({ error: "Título demasiado largo (max 200)." }, { status: 400 });
  }

  // Validar pertenencia antes de updatear
  const { data: conv } = await admin
    .from("consultant_conversations")
    .select("client_id")
    .eq("id", id)
    .maybeSingle();
  if (!conv || conv.client_id !== clientId) {
    return Response.json({ error: "Conversación no encontrada." }, { status: 404 });
  }

  const { error } = await admin
    .from("consultant_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("conversation PATCH error:", error);
    return Response.json({ error: "No pude renombrar la conversación." }, { status: 500 });
  }

  return Response.json({ ok: true, title });
}
