/**
 * GET  /api/vault/unlock  → estado de la bóveda { setup, canSetup }.
 * POST /api/vault/unlock  → valida la passphrase de equipo. No devuelve la
 *   privada; el front guarda la passphrase en memoria de sesión y la reenvía
 *   en cada operación que toca secretos (revelar).
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { unlockTeamKey, vaultIsSetup } from "@/lib/vault-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["director", "team"]);
  if (!access.ok) return access.response;
  return Response.json({
    setup: await vaultIsSetup(),
    canSetup: access.role === "director",
  });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["director", "team"]);
  if (!access.ok) return access.response;

  let body: { passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const passphrase = body.passphrase?.trim();
  if (!passphrase)
    return Response.json({ error: "Falta passphrase" }, { status: 400 });

  if (!(await vaultIsSetup())) {
    return Response.json(
      { error: "La bóveda no está configurada todavía.", setup: false },
      { status: 400 },
    );
  }
  const priv = await unlockTeamKey(passphrase);
  if (!priv)
    return Response.json({ error: "Passphrase incorrecta" }, { status: 401 });

  return Response.json({ ok: true });
}
