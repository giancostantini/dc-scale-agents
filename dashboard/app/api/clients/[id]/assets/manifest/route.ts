/**
 * GET  /api/clients/[id]/assets/manifest  → devuelve el listado actual de
 *   assets agrupados por categoría → sub-categoría. Usado por la UI.
 *
 * POST /api/clients/[id]/assets/manifest  → regenera el manifest a partir
 *   del estado del bucket client-assets, lo escribe a
 *   `vault/clients/<id>/brand/assets.md` (commit a main via vault-writer)
 *   y devuelve el contenido generado.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  loadClientAssets,
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
    const assets = await loadClientAssets(clientId);
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
      loadClientAssets(clientId),
    ]);

    const clientName = clientRow?.name ?? clientId;
    const markdown = renderManifestMarkdown(clientId, clientName, assets);

    const result = await writeVaultFile({
      repoPath: `vault/clients/${clientId}/brand/assets.md`,
      content: markdown,
      clientId,
      commitMessage: `Asset library manifest regenerado para ${clientId}`,
    });

    let assetsTotal = 0;
    for (const cat of Object.values(assets)) {
      for (const sub of Object.values(cat)) {
        assetsTotal += sub.length;
      }
    }

    return Response.json({
      ok: true,
      sha: result.sha,
      created: result.created,
      assetsTotal,
      manifestPreview: markdown.slice(0, 2000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "regenerate failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
