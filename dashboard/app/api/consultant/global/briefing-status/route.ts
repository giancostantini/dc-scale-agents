/**
 * GET /api/consultant/global/briefing-status
 *
 * Si el user tiene un mensaje is_briefing=true sin leer (read_at IS NULL)
 * en su pinned conversation, devolvemos { hasUnread: true, ... } para
 * que el widget pinte el badge rojo en el FAB.
 *
 * Auth: Authorization: Bearer <supabase access token>.
 *
 * Response:
 *   { hasUnread: boolean, briefingMessageId?: string, briefingDate?: string }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadCallerContext } from "@/lib/consultant-global-context";

export const dynamic = "force-dynamic";

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
    return Response.json({ hasUnread: false });
  }

  // Buscar pinned
  const { data: conv } = await admin
    .from("consultant_conversations")
    .select("id")
    .eq("user_id", caller.userId)
    .eq("scope", "global")
    .eq("is_pinned", true)
    .maybeSingle();

  if (!conv) {
    return Response.json({ hasUnread: false });
  }

  // Último briefing sin leer
  const { data: briefing } = await admin
    .from("consultant_messages")
    .select("id, created_at")
    .eq("conversation_id", conv.id)
    .eq("is_briefing", true)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!briefing) {
    return Response.json({ hasUnread: false });
  }

  return Response.json({
    hasUnread: true,
    briefingMessageId: briefing.id,
    briefingDate: briefing.created_at,
  });
}
