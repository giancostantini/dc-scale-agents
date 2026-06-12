/**
 * GET  /api/portal/credentials  → lista ENMASCARADA de las credenciales del
 *   cliente (las que cargó él + las que cargó el equipo). `clientReadable`
 *   indica si el cliente puede revelarla (tiene su DEK).
 * POST /api/portal/credentials  → el cliente deposita una credencial. Cifrado
 *   de SOBRE para el equipo + el cliente (ambas públicas) → aparece sola en la
 *   vista interna del equipo. Requiere tener la bóveda configurada.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requirePortalClient } from "@/lib/portal-auth";
import { getTeamPublicKey, getClientPublicKey } from "@/lib/vault-server";
import { sealSecret } from "@/lib/vault-crypto";
import { logAction } from "@/lib/audit";

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

export async function GET(req: NextRequest) {
  const auth = await requirePortalClient(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("client_credentials")
    .select(
      "id, label, category, username, url, notes_ct, secret_dek_client, added_by_role, created_at, updated_at",
    )
    .eq("client_id", auth.clientId)
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
    clientReadable: !!r.secret_dek_client,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  return Response.json({ credentials });
}

export async function POST(req: NextRequest) {
  const auth = await requirePortalClient(req);
  if (!auth.ok) return auth.response;

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

  // El cliente necesita su bóveda activa (su pública) y el equipo la suya
  // (toda credencial se cifra también para el equipo, que es quien la usa).
  const clientPub = await getClientPublicKey(auth.clientId);
  if (!clientPub) {
    return Response.json(
      { error: "Configurá tu bóveda antes de guardar credenciales.", setup: false },
      { status: 409 },
    );
  }
  const teamPub = await getTeamPublicKey();
  if (!teamPub) {
    return Response.json(
      {
        error:
          "El equipo todavía no habilitó la bóveda compartida. Avisanos y lo resolvemos.",
      },
      { status: 409 },
    );
  }

  // Orden de las públicas: [equipo, cliente] → deks[0]=team, deks[1]=client.
  const pubs = [teamPub, clientPub];
  const sealedSecret = sealSecret(secret, pubs);
  const sealedNotes = body.notes ? sealSecret(body.notes, pubs) : null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("client_credentials")
    .insert({
      client_id: auth.clientId,
      label,
      category,
      username: body.username?.trim() || null,
      url: body.url?.trim() || null,
      secret_ct: sealedSecret.ct,
      secret_dek_team: sealedSecret.deks[0],
      secret_dek_client: sealedSecret.deks[1],
      notes_ct: sealedNotes?.ct ?? null,
      notes_dek_team: sealedNotes?.deks[0] ?? null,
      notes_dek_client: sealedNotes?.deks[1] ?? null,
      added_by_role: "client",
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Queda registrado que el cliente cargó una credencial (el director lo ve en
  // /configuracion/audit).
  await logAction({
    actorId: auth.userId,
    actorEmail: auth.email,
    action: "credential.create",
    targetType: "client_credential",
    targetId: data.id,
    metadata: { client_id: auth.clientId, label, added_by_role: "client" },
  });

  return Response.json({ ok: true, id: data.id });
}
