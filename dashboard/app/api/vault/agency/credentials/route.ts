/**
 * GET  /api/vault/agency/credentials  → lista ENMASCARADA de las credenciales
 *   de la agencia (D&C). Solo director.
 * POST /api/vault/agency/credentials  → deposita una credencial de la agencia.
 *   Cifrado de sobre: solo necesita la llave PÚBLICA del equipo (sin passphrase).
 *   Solo director.
 *
 * Los secretos nunca se devuelven acá; se obtienen vía .../[credId]/reveal.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";
import { getTeamPublicKey } from "@/lib/vault-server";
import { sealSecret } from "@/lib/vault-crypto";
import { logAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "banco",
  "fiscal",
  "infra",
  "herramientas",
  "dominio",
  "email",
  "social",
  "otro",
];

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["director"]);
  if (!access.ok) return access.response;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("agency_credentials")
    .select("id, label, category, username, url, notes_ct, created_at, updated_at")
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  return Response.json({ credentials });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["director"]);
  if (!access.ok) return access.response;

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

  const teamPub = await getTeamPublicKey();
  if (!teamPub) {
    return Response.json(
      { error: "La bóveda del equipo no está configurada todavía." },
      { status: 409 },
    );
  }

  const sealedSecret = sealSecret(secret, [teamPub]);
  const sealedNotes = body.notes ? sealSecret(body.notes, [teamPub]) : null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("agency_credentials")
    .insert({
      label,
      category,
      username: body.username?.trim() || null,
      url: body.url?.trim() || null,
      secret_ct: sealedSecret.ct,
      secret_dek_team: sealedSecret.deks[0],
      notes_ct: sealedNotes?.ct ?? null,
      notes_dek_team: sealedNotes?.deks[0] ?? null,
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAction({
    actorId: access.userId,
    actorEmail: access.email,
    action: "credential.create",
    targetType: "agency_credential",
    targetId: data.id,
    metadata: { label, scope: "agency" },
  });

  return Response.json({ ok: true, id: data.id });
}
