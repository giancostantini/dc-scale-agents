/**
 * GET  /api/clients/[id]/credentials  → lista las credenciales del cliente,
 *   ENMASCARADAS (sin secreto). Incluye `addedByRole` (quién la cargó: equipo o
 *   cliente). Solo director / team asignado.
 * POST /api/clients/[id]/credentials  → el equipo deposita una credencial.
 *   Cifrado de SOBRE: solo necesita las llaves PÚBLICAS (equipo + cliente si ya
 *   tiene bóveda) → no hace falta passphrase para depositar. Solo director/team.
 *
 * Los secretos nunca se devuelven acá; se obtienen vía .../[credId]/reveal.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireClientAccess } from "@/lib/auth-guard";
import { getTeamPublicKey, getClientPublicKey } from "@/lib/vault-server";
import { sealSecret } from "@/lib/vault-crypto";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "cms",
  "hosting",
  "email",
  "social",
  "analytics",
  "dominio",
  "otro",
];

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }
  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("client_credentials")
    .select(
      "id, label, category, username, url, notes_ct, added_by_role, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .order("category", { ascending: true })
    .order("label", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const credentials = (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    category: r.category,
    username: r.username,
    url: r.url,
    hasNotes: !!r.notes_ct,
    addedByRole: r.added_by_role,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  return Response.json({ credentials });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }
  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  if (access.role === "client") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: {
    label?: string;
    category?: string;
    username?: string;
    url?: string;
    secret?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const label = body.label?.trim();
  const secret = body.secret;
  if (!label) return Response.json({ error: "Falta label" }, { status: 400 });
  if (!secret) return Response.json({ error: "Falta secret" }, { status: 400 });
  const category = CATEGORIES.includes(body.category ?? "")
    ? (body.category as string)
    : "otro";

  // Depositar = operación con llaves públicas. El equipo siempre; el cliente
  // también si ya activó su bóveda (así re-ve lo que cargamos por él).
  const teamPub = await getTeamPublicKey();
  if (!teamPub) {
    return Response.json(
      { error: "La bóveda del equipo no está configurada todavía." },
      { status: 409 },
    );
  }
  const clientPub = await getClientPublicKey(clientId);
  const pubs = clientPub ? [teamPub, clientPub] : [teamPub];

  const sealedSecret = sealSecret(secret, pubs);
  const sealedNotes = body.notes ? sealSecret(body.notes, pubs) : null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("client_credentials")
    .insert({
      client_id: clientId,
      label,
      category,
      username: body.username?.trim() || null,
      url: body.url?.trim() || null,
      secret_ct: sealedSecret.ct,
      secret_dek_team: sealedSecret.deks[0],
      secret_dek_client: clientPub ? sealedSecret.deks[1] : null,
      notes_ct: sealedNotes?.ct ?? null,
      notes_dek_team: sealedNotes?.deks[0] ?? null,
      notes_dek_client: sealedNotes && clientPub ? sealedNotes.deks[1] : null,
      added_by_role: "team",
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, id: data.id });
}
