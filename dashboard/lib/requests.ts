// ==================== CLIENT REQUESTS · helpers ====================
// Helpers client-side para listar y crear solicitudes (ofertas + acciones).
// Las RLS filtran automáticamente: el cliente solo ve las suyas, el
// team las de sus clientes asignados, el director todas.

import { getSupabase } from "./supabase/client";
import type {
  ClientRequest,
  ClientRequestStatus,
  ClientRequestType,
  ClientRequestUrgency,
} from "./types";

const REQ_COLS =
  "id, client_id, type, title, description, metadata, urgency, status, submitted_by, submitted_at, assigned_to, response, created_at, updated_at";

export async function listRequestsForClient(
  clientId: string,
): Promise<ClientRequest[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_requests")
    .select(REQ_COLS)
    .eq("client_id", clientId)
    .order("submitted_at", { ascending: false });
  if (error) {
    console.error("listRequestsForClient error:", error);
    return [];
  }
  return (data ?? []) as ClientRequest[];
}

export async function listAllRequests(): Promise<ClientRequest[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_requests")
    .select(REQ_COLS)
    .order("submitted_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ClientRequest[];
}

export interface CreateRequestInput {
  client_id: string;
  type: ClientRequestType;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  urgency?: ClientRequestUrgency;
}

export async function createRequest(
  input: CreateRequestInput,
): Promise<ClientRequest> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sin sesión");

  const { data, error } = await supabase
    .from("client_requests")
    .insert({
      client_id: input.client_id,
      type: input.type,
      title: input.title.trim(),
      description: input.description.trim(),
      metadata: input.metadata ?? {},
      urgency: input.urgency ?? "media",
      status: "pending",
      submitted_by: user.id,
    })
    .select(REQ_COLS)
    .single();
  if (error) throw error;

  // Fire-and-forget: el endpoint con service role crea la notif para el equipo.
  // Si falla (RLS, env vars), logueamos pero NO rompemos la creación de la solicitud.
  fetch("/api/portal/requests/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: data.id }),
  }).catch((err) => {
    console.warn("[createRequest] notify endpoint failed:", err);
  });

  return data as ClientRequest;
}

export interface PortalOfferEdit {
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  urgency?: ClientRequestUrgency;
}

/**
 * El cliente edita una oferta/paquete activo desde el portal. Va por
 * PATCH /api/portal/requests/[id] (service role + validaciones) porque la RLS
 * no le deja hacer UPDATE directo. El endpoint marca metadata.editedAt y avisa
 * al equipo.
 */
export async function updateRequestFromPortal(
  id: string,
  input: PortalOfferEdit,
): Promise<ClientRequest> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) throw new Error("Tu sesión expiró. Volvé a entrar.");

  const res = await fetch(`/api/portal/requests/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    request?: ClientRequest;
    error?: string;
  };
  if (!res.ok || !data.request) {
    throw new Error(data.error ?? "No se pudieron guardar los cambios.");
  }
  return data.request;
}

export interface UpdateRequestInput {
  status?: ClientRequestStatus;
  response?: string | null;
  assigned_to?: string | null;
  urgency?: ClientRequestUrgency;
}

export async function updateRequest(
  id: string,
  patch: UpdateRequestInput,
): Promise<ClientRequest> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("client_requests")
    .update(patch)
    .eq("id", id)
    .select(REQ_COLS)
    .single();
  if (error) throw error;
  return data as ClientRequest;
}

export function requestStatusLabel(s: ClientRequestStatus): string {
  switch (s) {
    case "pending":
      return "Recibida";
    case "reviewing":
      return "En revisión";
    case "in_progress":
      return "En curso";
    case "done":
      return "Completada";
    case "rejected":
      return "Rechazada";
  }
}

export function requestStatusColor(s: ClientRequestStatus): string {
  switch (s) {
    case "pending":
      return "var(--sand-dark)";
    case "reviewing":
      return "var(--sand)";
    case "in_progress":
      return "var(--yellow-warn)";
    case "done":
      return "var(--green-ok)";
    case "rejected":
      return "var(--red-warn)";
  }
}
