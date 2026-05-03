/**
 * POST /api/portal/requests/notify
 *
 * Crea una notificación in-app para el equipo cuando un cliente envía una
 * solicitud nueva (oferta o acción). El cliente llama este endpoint después
 * de hacer el INSERT en client_requests desde el portal.
 *
 * Body: { requestId: string }
 *
 * Side effects:
 *   - Inserta una fila en `notifications` con level/title/body/link.
 *   - Realtime (NotificationBell) la levanta automáticamente para todos los
 *     team-asignados al cliente y para el director.
 *
 * Si el insert falla, devuelve 500 pero el caller debería ignorar el error —
 * la solicitud ya fue creada y la falta de notif no rompe el flujo.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

interface NotifyBody {
  requestId: string;
}

const URGENCY_LEVEL: Record<string, "info" | "warning"> = {
  baja: "info",
  media: "info",
  alta: "warning",
};

export async function POST(req: NextRequest) {
  let body: NotifyBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.requestId) {
    return Response.json({ error: "Missing requestId" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: request, error: fetchError } = await supabase
    .from("client_requests")
    .select("id, client_id, type, title, urgency")
    .eq("id", body.requestId)
    .single();

  if (fetchError || !request) {
    return Response.json(
      { error: `Request not found: ${fetchError?.message ?? "unknown"}` },
      { status: 404 },
    );
  }

  const typeLabel = request.type === "oferta" ? "oferta" : "acción";
  const level = URGENCY_LEVEL[request.urgency] ?? "info";

  const { error: insertError } = await supabase.from("notifications").insert({
    client: request.client_id,
    to_role: "team", // visible para director + team asignado al cliente
    agent: "portal",
    level,
    title: `Nueva ${typeLabel} del cliente`,
    body: request.title,
    link: `/cliente/${request.client_id}/solicitudes`,
    read: false,
    email_sent: false,
  });

  if (insertError) {
    return Response.json(
      { error: `Notif insert failed: ${insertError.message}` },
      { status: 500 },
    );
  }

  // Disparar email transaccional al director + team asignado al cliente.
  // Fire-and-forget para no bloquear la respuesta. Si falla, queda la notif
  // in-app y un cron posterior puede reintentar.
  fetch(`${req.nextUrl.origin}/api/notifications/dispatch-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: request.id }),
  }).catch((err) => {
    console.warn("[notify] dispatch-email failed (non-blocking):", err);
  });

  return Response.json({ ok: true });
}
