/**
 * POST /api/consultant/global/mark-read
 *
 * Marca todos los mensajes is_briefing=true en la pinned conversation del
 * user como leídos (read_at = now()). Idempotente.
 *
 * Auth: Authorization: Bearer <supabase access token>.
 *
 * Body: {} (sin params — siempre marca todos los unread del user)
 *
 * Response: { updated: number }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadCallerContext } from "@/lib/consultant-global-context";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
    return Response.json({ updated: 0 });
  }

  const { data: conv } = await admin
    .from("consultant_conversations")
    .select("id")
    .eq("user_id", caller.userId)
    .eq("scope", "global")
    .eq("is_pinned", true)
    .maybeSingle();

  if (!conv) {
    return Response.json({ updated: 0 });
  }

  const { data, error } = await admin
    .from("consultant_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conv.id)
    .eq("is_briefing", true)
    .is("read_at", null)
    .select("id");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ updated: data?.length ?? 0 });
}
