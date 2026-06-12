/**
 * GET / PUT /api/clients/[id]/brand
 *
 * GET: lista los archivos del brand/ del cliente y devuelve sus contenidos.
 *      Si no hay brand/ procesado todavía, retorna brand: {}.
 * PUT: sobrescribe un archivo del brand/ desde la pantalla de edición.
 *      filename debe estar en la whitelist de las 8 secciones oficiales
 *      (los agentes esperan esos nombres exactos).
 *
 * SEGURIDAD: ambos métodos exigen acceso al cliente (director / team asignado /
 * client dueño) vía requireClientAccess. Sin este guard el endpoint era
 * accesible SIN autenticación → lectura cross-tenant del brand y escritura
 * arbitraria en los .md que los agentes leen como instrucciones (inyección de
 * prompt almacenada). El comportamiento para usuarios legítimos no cambia.
 *
 * Body (PUT):
 *   { filename: "positioning.md", content: "..." }
 */

import { NextRequest } from "next/server";
import { writeVaultFile } from "@/lib/vault-writer";
import { loadClientBrand, listClientBrandFiles } from "@/lib/vault-loader";
import { requireClientAccess } from "@/lib/auth-guard";

const VALID_FILENAMES = new Set([
  "positioning.md",
  "voice-operational.md",
  "voice-character.md",
  "voice-decision.md",
  "visual-identity.md",
  "photography.md",
  "content-formats.md",
  "restrictions.md",
]);

interface PutBody {
  filename: string;
  content: string;
}

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

  try {
    const [files, brand] = await Promise.all([
      listClientBrandFiles(clientId),
      loadClientBrand(clientId),
    ]);
    return Response.json({ files, brand });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "load failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;

  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, content } = body;
  if (!filename || typeof filename !== "string") {
    return Response.json({ error: "filename required" }, { status: 400 });
  }
  if (!VALID_FILENAMES.has(filename)) {
    return Response.json(
      {
        error: `filename inválido. Permitidos: ${[...VALID_FILENAMES].join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (typeof content !== "string") {
    return Response.json({ error: "content must be a string" }, { status: 400 });
  }
  if (content.length > 200_000) {
    return Response.json(
      { error: `content too large (${content.length} chars). Máx 200000.` },
      { status: 413 },
    );
  }

  try {
    const result = await writeVaultFile({
      repoPath: `vault/clients/${clientId}/brand/${filename}`,
      content,
      clientId,
      commitMessage: `Edit ${filename} de ${clientId} desde dashboard`,
    });
    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "write failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
