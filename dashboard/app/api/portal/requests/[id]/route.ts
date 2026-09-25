/**
 * PATCH /api/portal/requests/[id]
 *
 * El cliente edita una oferta/paquete que ya cargó desde el portal.
 *
 * La RLS de client_requests no deja que el cliente haga UPDATE (migración
 * 007: una vez enviada, solo la gestiona el equipo). Por eso la edición pasa
 * por acá, con service role, y con todas las validaciones en el server:
 *   - el caller es role='client' y la solicitud es de SU cliente;
 *   - es una oferta (type='oferta');
 *   - sigue activa (pending / reviewing / in_progress) — el histórico no se toca.
 *
 * Solo se pisan title, description, urgency y metadata. Nunca status, response ni
 * assigned_to (eso es del equipo). En metadata se marca editedAt + editCount
 * para que las dos vistas muestren "Paquete editado · fecha".
 *
 * Side effects: notificación in-app al equipo ("Paquete actualizado por el
 * cliente") + email vía dispatch-email con `updated: true`. Si la notif falla
 * la edición igual queda guardada.
 *
 * Body: { title: string, description?: string, urgency?: string, metadata: object }
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireClientAccess, requireRole } from "@/lib/auth-guard";

const ACTIVE_STATUSES = ["pending", "reviewing", "in_progress"];

// Campos de metadata que el cliente puede editar (form de paquete + oferta genérica).
const EDITABLE_METADATA = [
  "destino",
  "precio",
  "precioNota",
  "tier",
  "startDate",
  "endDate",
  "details",
  "discountPct",
  "product",
] as const;

interface PatchBody {
  title?: unknown;
  description?: unknown;
  metadata?: unknown;
  urgency?: unknown;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = await requireRole(req, ["client"]);
  if (!role.ok) return role.response;

  const { id } = await params;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 3) {
    return Response.json(
      { error: "El título tiene que tener al menos 3 caracteres." },
      { status: 400 },
    );
  }
  if (!body.metadata || typeof body.metadata !== "object" || Array.isArray(body.metadata)) {
    return Response.json({ error: "Faltan los datos de la oferta." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: request, error: fetchError } = await admin
    .from("client_requests")
    .select("id, client_id, type, status, metadata, urgency")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !request) {
    return Response.json({ error: "No encontramos esa oferta." }, { status: 404 });
  }

  const access = await requireClientAccess(req, request.client_id);
  if (!access.ok) return access.response;

  if (request.type !== "oferta") {
    return Response.json(
      { error: "Solo se pueden editar ofertas y paquetes." },
      { status: 403 },
    );
  }
  if (!ACTIVE_STATUSES.includes(request.status)) {
    return Response.json(
      { error: "Esta oferta ya está cerrada y no se puede editar." },
      { status: 409 },
    );
  }

  // Metadata nueva = solo campos editables del body + lo que no es editable
  // del registro original (ej. marcas internas), + la marca de edición.
  const incoming = body.metadata as Record<string, unknown>;
  const previous = (request.metadata ?? {}) as Record<string, unknown>;
  const metadata: Record<string, unknown> = { ...previous };
  for (const key of EDITABLE_METADATA) {
    const value = incoming[key];
    if (value === undefined || value === null || value === "") delete metadata[key];
    else metadata[key] = value;
  }
  const prevCount = typeof previous.editCount === "number" ? previous.editCount : 0;
  metadata.editedAt = new Date().toISOString();
  metadata.editCount = prevCount + 1;

  const patch: Record<string, unknown> = { title, metadata };
  if (typeof body.description === "string") patch.description = body.description.trim();
  if (body.urgency === "baja" || body.urgency === "media" || body.urgency === "alta") {
    patch.urgency = body.urgency;
  }

  const { data: updated, error: updateError } = await admin
    .from("client_requests")
    .update(patch)
    .eq("id", id)
    .select(
      "id, client_id, type, title, description, metadata, urgency, status, submitted_by, submitted_at, assigned_to, response, created_at, updated_at",
    )
    .single();

  if (updateError || !updated) {
    return Response.json(
      { error: `No se pudo guardar: ${updateError?.message ?? "error desconocido"}` },
      { status: 500 },
    );
  }

  // Aviso al equipo. Mismo formato que /api/portal/requests/notify para que la
  // campana y dispatch-email lo levanten igual.
  const isPackage = metadata.destino != null;
  const { error: notifError } = await admin.from("notifications").insert({
    client: updated.client_id,
    to_role: "team",
    agent: "portal",
    level: "info",
    title: isPackage ? "Paquete actualizado por el cliente" : "Oferta actualizada por el cliente",
    body: updated.title,
    link: `/cliente/${updated.client_id}/solicitudes`,
    read: false,
    email_sent: false,
  });

  if (notifError) {
    console.warn("[portal/requests PATCH] notif insert failed:", notifError.message);
  } else {
    fetch(`${req.nextUrl.origin}/api/notifications/dispatch-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ requestId: updated.id, updated: true }),
    }).catch((err) => {
      console.warn("[portal/requests PATCH] dispatch-email failed (non-blocking):", err);
    });
  }

  return Response.json({ request: updated });
}
