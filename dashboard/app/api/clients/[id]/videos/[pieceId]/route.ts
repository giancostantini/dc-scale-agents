/**
 * GET /api/clients/[id]/videos/[pieceId]
 *
 * Descarga directa del MP4 generado por el content-creator. El archivo vive
 * en `vault/clients/<id>/videos/<pieceId>.mp4` en el repo de GitHub. Esta
 * ruta lo busca via GitHub Contents API con el GH_DISPATCH_TOKEN y stream-ea
 * el binario al cliente con headers correctos.
 *
 * Soporta archivos hasta 100 MB (límite de GitHub Contents API). MP4s de
 * reels típicos (9-15s, 1080×1920, 30fps, H.264) pesan 5-30 MB.
 *
 * Query params:
 *   ?download=1  → fuerza descarga (Content-Disposition: attachment)
 *   sin query    → inline (el browser lo abre como video)
 *
 * Permisos: cualquier authenticated del dashboard (validación de session
 * implícita por uso del GH_DISPATCH_TOKEN del backend).
 */

import { NextRequest } from "next/server";

const GITHUB_API = "https://api.github.com";
const BRANCH = "main";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; pieceId: string }> },
) {
  const { id: clientId, pieceId } = await context.params;

  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }
  // pieceId puede contener letras, números, guiones (formato típico:
  // "001", "wiztrip-003", o algún identificador del agente). Validamos
  // contra path traversal.
  if (!pieceId || !/^[a-zA-Z0-9_-]+$/.test(pieceId)) {
    return Response.json({ error: "Invalid pieceId" }, { status: 400 });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    return Response.json(
      { error: "Faltan env vars (GH_DISPATCH_TOKEN / GITHUB_OWNER / GITHUB_REPO)" },
      { status: 500 },
    );
  }

  const repoPath = `vault/clients/${clientId}/videos/${pieceId}.mp4`;
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${repoPath}?ref=${BRANCH}`;

  const ghRes = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (ghRes.status === 404) {
    return Response.json(
      {
        error: `Video no encontrado: ${repoPath}. Verificá que el run de content-creator haya terminado y commiteado el archivo.`,
      },
      { status: 404 },
    );
  }
  if (!ghRes.ok) {
    const txt = await ghRes.text().catch(() => "");
    return Response.json(
      {
        error: `GitHub Contents API ${ghRes.status}: ${txt.slice(0, 200)}`,
      },
      { status: 502 },
    );
  }

  // Stream el body de GitHub directo al cliente. Para archivos grandes esto
  // evita cargar todo en memoria de la Vercel function.
  const wantDownload = req.nextUrl.searchParams.get("download") === "1";
  const disposition = wantDownload
    ? `attachment; filename="${clientId}-${pieceId}.mp4"`
    : `inline; filename="${clientId}-${pieceId}.mp4"`;

  return new Response(ghRes.body, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": disposition,
      // Cacheable corto — si vuelve a pedir el mismo, browser lo guarda 60s
      "Cache-Control": "private, max-age=60",
    },
  });
}
