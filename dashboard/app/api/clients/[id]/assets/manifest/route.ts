/**
 * GET  /api/clients/[id]/assets/manifest  → devuelve el listado actual de
 *   assets agrupados por categoría. Usado por la UI para mostrar qué hay.
 *
 * POST /api/clients/[id]/assets/manifest  → regenera el manifest a partir
 *   del estado actual del bucket client-assets, lo escribe a
 *   `vault/clients/<id>/brand/assets.md` (commit a main via vault-writer)
 *   y devuelve el contenido generado. Se llama después de cada upload/delete
 *   desde la UI para mantener el manifest sincronizado.
 *
 * El manifest es el catálogo que los agentes consultan al generar contenido.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  listAssetsServerSide,
  renderManifestMarkdown,
} from "@/lib/asset-manifest";
import { writeVaultFile } from "@/lib/vault-writer";

interface ClientRow {
  name: string;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  try {
    const assets = await listAssetsServerSide(clientId);
    return Response.json({ assets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "list failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [{ data: clientRow }, assets] = await Promise.all([
      supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .single<ClientRow>(),
      listAssetsServerSide(clientId),
    ]);

    const clientName = clientRow?.name ?? clientId;
    const markdown = renderManifestMarkdown(clientId, clientName, assets);

    const result = await writeVaultFile({
      repoPath: `vault/clients/${clientId}/brand/assets.md`,
      content: markdown,
      clientId,
      commitMessage: `Asset library manifest regenerado para ${clientId}`,
    });

    return Response.json({
      ok: true,
      sha: result.sha,
      created: result.created,
      assetsTotal:
        assets.logo.length +
        assets.mascot.length +
        assets.patterns.length +
        assets.inspiration.length,
      manifestPreview: markdown.slice(0, 2000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "regenerate failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
