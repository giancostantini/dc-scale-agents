/**
 * POST /api/opportunities/dismiss  { id: number }
 *
 * Descarta una oportunidad del asesor (portal_opportunities, mig 107). La
 * puede descartar el cliente (solo las de su empresa) o el equipo. La
 * escritura va con service role: la tabla no tiene policy de UPDATE.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireClientAccess, requireRole } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  const role = await requireRole(req, ["client", "director", "team"]);
  if (!role.ok) return role.response;

  let id: number;
  try {
    id = Number(((await req.json()) as { id?: unknown }).id);
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!Number.isFinite(id)) return Response.json({ error: "Falta id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: opp } = await admin
    .from("portal_opportunities")
    .select("id, client_id")
    .eq("id", id)
    .maybeSingle();
  if (!opp) return Response.json({ error: "No encontramos esa oportunidad." }, { status: 404 });

  const access = await requireClientAccess(req, opp.client_id as string);
  if (!access.ok) return access.response;

  const { error } = await admin
    .from("portal_opportunities")
    .update({ status: "descartada", dismissed_by: role.userId })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
