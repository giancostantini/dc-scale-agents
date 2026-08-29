/**
 * /api/consultant/global/conversation
 *
 * GET  — la conversación pinned de la persona pedida + últimos 30 mensajes
 *        en orden cronológico. NO crea nada (eso lo hace el POST del chat).
 * DELETE — "limpiar chat" REAL: archiva la pinned de la persona
 *        (is_pinned=false). No se borra nada — el historial queda en la DB,
 *        solo deja de ser la conversación activa; el próximo mensaje (o el
 *        morning-briefing, para 'general') crea una pinned nueva vacía.
 *
 * Auth: Authorization: Bearer <supabase access token>.
 *
 * GET response:
 *   {
 *     conversation: { id, title, created_at, updated_at } | null,
 *     messages: [{ id, role, content, is_briefing, read_at, created_at }]
 *   }
 * DELETE response: { ok: true, archived: boolean }
 */

import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  loadCallerContext,
  type CallerContext,
} from "@/lib/consultant-global-context";
import { PERSONA_IDS } from "@/lib/gerencias";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 30;

/** Auth dance común a GET y DELETE: env → bearer → user → caller. */
async function resolveCaller(
  req: NextRequest,
): Promise<
  | { ok: true; admin: SupabaseClient; caller: CallerContext }
  | { ok: false; response: Response }
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return {
      ok: false,
      response: Response.json({ error: "Servidor no configurado." }, { status: 500 }),
    };
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return {
      ok: false,
      response: Response.json({ error: "Sin sesión" }, { status: 401 }),
    };
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: authUser },
  } = await callerClient.auth.getUser();
  if (!authUser) {
    return {
      ok: false,
      response: Response.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const caller = await loadCallerContext(admin, authUser.id);
  if (!caller) {
    return {
      ok: false,
      response: Response.json(
        { error: "Solo director/team pueden usar el consultor global." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, admin, caller };
}

export async function GET(req: NextRequest) {
  const auth = await resolveCaller(req);
  if (!auth.ok) return auth.response;
  const { admin, caller } = auth;

  // Persona (migs 095/097): cada persona tiene su pinned. Default general;
  // valor desconocido cae a general (lectura — sin 400).
  const personaParam = req.nextUrl.searchParams.get("persona") ?? "general";
  const persona = (PERSONA_IDS as string[]).includes(personaParam)
    ? personaParam
    : "general";

  // Buscar pinned. NO la creamos acá — eso lo hace el POST cuando el user
  // efectivamente manda un mensaje. Si no existe, devolvemos vacío.
  const { data: conv } = await admin
    .from("consultant_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", caller.userId)
    .eq("scope", "global")
    .eq("persona", persona)
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

export async function DELETE(req: NextRequest) {
  const auth = await resolveCaller(req);
  if (!auth.ok) return auth.response;
  const { admin, caller } = auth;

  // Mutación: persona inválida es 400 explícito (acá no hay fallback).
  const persona = req.nextUrl.searchParams.get("persona") ?? "general";
  if (!(PERSONA_IDS as string[]).includes(persona)) {
    return Response.json({ error: `Persona desconocida: '${persona}'` }, { status: 400 });
  }

  // Sin check de allowedRoles a propósito: solo se archiva conversación
  // PROPIA (filtro por user_id), y un rol degradado tiene que poder
  // archivar una pinned vieja de una persona que ya no puede usar.
  // El partial unique index garantiza a lo sumo 1 fila afectada.
  const { data, error } = await admin
    .from("consultant_conversations")
    .update({ is_pinned: false, updated_at: new Date().toISOString() })
    .eq("user_id", caller.userId)
    .eq("scope", "global")
    .eq("persona", persona)
    .eq("is_pinned", true)
    .select("id");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, archived: (data?.length ?? 0) > 0 });
}
