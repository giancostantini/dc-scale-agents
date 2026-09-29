/**
 * Resolver una recomendación del cliente (client_requests type=recomendacion)
 * y avisarle al cliente que su recomendación fue atendida.
 *
 *   POST { requestId } → marca la solicitud status='done' + inserta una
 *   notificación to_role='client' del cliente ("Tu recomendación fue
 *   resuelta").
 *
 * Auth: director o team (no el cliente). Usa service role para escribir la
 * notificación al cliente.
 */

import { NextRequest } from "next/server";
import { requireClientAccess } from "@/lib/auth-guard";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json(
      { error: "Solo el equipo puede resolver recomendaciones." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { requestId?: string };
  if (!body.requestId) {
    return Response.json({ error: "Falta requestId." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Traer la solicitud y validar que sea de este cliente y una recomendación.
  const { data: request, error: fetchErr } = await admin
    .from("client_requests")
    .select("id, client_id, type, title")
    .eq("id", body.requestId)
    .single();
  if (fetchErr || !request) {
    return Response.json({ error: "Recomendación no encontrada." }, { status: 404 });
  }
  if (request.client_id !== clientId || request.type !== "recomendacion") {
    return Response.json({ error: "Recomendación inválida." }, { status: 400 });
  }

  // 1. Marcar resuelta.
  const { error: updErr } = await admin
    .from("client_requests")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", request.id);
  if (updErr) {
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  // 2. Notificar al cliente en su portal.
  const { error: notifErr } = await admin.from("notifications").insert({
    client: clientId,
    to_role: "client", // lo ve el cliente en su portal
    agent: "portal",
    level: "info",
    title: "Tu recomendación fue resuelta",
    body: `Ajustamos el contenido según tu recomendación: ${request.title}`,
    link: "/portal/agenda",
    read: false,
    email_sent: false,
  });
  if (notifErr) {
    // La solicitud ya quedó resuelta; el aviso es best-effort.
    console.warn("[recommendations/resolve] notif error:", notifErr.message);
  }

  return Response.json({ ok: true });
}
