/**
 * GET /api/consultant/global/conversation
 *
 * Devuelve la conversación pinned global del user (creando una vacía si no
 * existe todavía) + los últimos 30 mensajes en orden cronológico.
 *
 * Auth: Authorization: Bearer <supabase access token>.
 *
 * Response:
 *   {
 *     conversation: { id, title, created_at, updated_at },
 *     messages: [{ id, role, content, is_briefing, read_at, created_at }]
 *   }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadCallerContext } from "@/lib/consultant-global-context";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 30;

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado." }, { status: 500 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Sin sesión" }, { status: 401 });

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: authUser },
  } = await callerClient.auth.getUser();
  if (!authUser) return Response.json({ error: "No autenticado" }, { status: 401 });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const caller = await loadCallerContext(admin, authUser.id);
  if (!caller) {
    return Response.json(
      { error: "Solo director/team pueden usar el consultor global." },
      { status: 403 },
    );
  }

  // Buscar pinned. NO la creamos acá — eso lo hace el POST cuando el user
  // efectivamente manda un mensaje. Si no existe, devolvemos vacío.
  const { data: conv } = await admin
    .from("consultant_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", caller.userId)
    .eq("scope", "global")
    .eq("is_pinned", true)
    .maybeSingle();

  if (!conv) {
    return Response.json({
      conversation: null,
      messages: [],
    });
  }

  const { data: messages } = await admin
    .from("consultant_messages")
    .select("id, role, content, is_briefing, read_at, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES);

  // Volver a ascendente para render
  const ordered = (messages ?? []).slice().reverse();

  return Response.json({
    conversation: conv,
    messages: ordered,
  });
}
