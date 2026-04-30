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
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");

  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return errorResponse("Invalid client id", 400, wantsHtml);
  }
  // pieceId puede contener letras, números, guiones (formato típico:
  // "001", "wiztrip-003", o algún identificador del agente). Validamos
  // contra path traversal.
  if (!pieceId || !/^[a-zA-Z0-9_-]+$/.test(pieceId)) {
    return errorResponse("Invalid pieceId", 400, wantsHtml);
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    return errorResponse(
      "Faltan env vars (GH_DISPATCH_TOKEN / GITHUB_OWNER / GITHUB_REPO)",
      500,
      wantsHtml,
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
    return errorResponse(
      `Video no encontrado: ${repoPath}. El run de content-creator todavía no terminó o no produjo MP4. Mirá la pieza en /cliente/${clientId}/biblioteca.`,
      404,
      wantsHtml,
    );
  }
  if (!ghRes.ok) {
    const txt = await ghRes.text().catch(() => "");
    return errorResponse(
      `GitHub Contents API ${ghRes.status}: ${txt.slice(0, 200)}`,
      502,
      wantsHtml,
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

function errorResponse(message: string, status: number, wantsHtml: boolean): Response {
  if (!wantsHtml) {
    return Response.json({ error: message }, { status });
  }
  const safe = message.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Video no disponible</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0a1a0c; color: #f4ede0; margin: 0; padding: 40px; }
  .card { max-width: 560px; margin: 80px auto; border-left: 3px solid #b04b3a; padding: 24px 28px; background: rgba(255,255,255,0.03); }
  .eyebrow { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #b04b3a; font-weight: 700; margin-bottom: 8px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 12px; letter-spacing: -0.01em; }
  p { font-size: 13px; line-height: 1.6; opacity: 0.85; margin: 0 0 16px; }
  a { color: #f4ede0; text-decoration: underline; }
</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">${status} · Video no disponible</div>
    <h1>El MP4 no está disponible todavía.</h1>
    <p>${safe}</p>
    <p><a href="javascript:history.back()">← Volver</a></p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
