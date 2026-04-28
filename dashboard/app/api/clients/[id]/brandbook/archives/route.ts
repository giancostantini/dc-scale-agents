/**
 * GET /api/clients/[id]/brandbook/archives
 *
 * Lista las versiones anteriores del brand/ de un cliente. Cada vez que el
 * brandbook-processor re-procesa, mueve los archivos viejos a
 * `vault/clients/<id>/brand/_archive/<YYYY-MM-DD-HHmm>/`.
 *
 * Response:
 *   { archives: [{ stamp, fileCount, sourceUrl?, viewUrl }] }
 */

import { NextRequest } from "next/server";

const GITHUB_API = "https://api.github.com";
const BRANCH = "main";

interface DirEntry {
  type: string;
  name: string;
  path: string;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await context.params;
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    return Response.json(
      {
        error:
          "Faltan env vars (GH_DISPATCH_TOKEN / GITHUB_OWNER / GITHUB_REPO)",
      },
      { status: 500 },
    );
  }

  const archiveBase = `vault/clients/${clientId}/brand/_archive`;
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${archiveBase}?ref=${BRANCH}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (res.status === 404) {
    return Response.json({ archives: [] });
  }
  if (!res.ok) {
    return Response.json(
      { error: `GitHub API ${res.status}` },
      { status: 500 },
    );
  }

  const entries = (await res.json()) as DirEntry[];

  // Cada entry es un folder con nombre tipo "2026-04-23-1834"
  const archives = await Promise.all(
    entries
      .filter((e) => e.type === "dir")
      .sort((a, b) => b.name.localeCompare(a.name))
      .map(async (folder) => {
        // Listar archivos dentro del folder
        const folderUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${archiveBase}/${folder.name}?ref=${BRANCH}`;
        try {
          const fr = await fetch(folderUrl, {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
            },
          });
          if (!fr.ok) {
            return {
              stamp: folder.name,
              fileCount: 0,
              viewUrl: `https://github.com/${owner}/${repo}/tree/${BRANCH}/${archiveBase}/${folder.name}`,
            };
          }
          const fileEntries = (await fr.json()) as DirEntry[];
          const mdFiles = fileEntries.filter(
            (f) => f.type === "file" && f.name.endsWith(".md"),
          );
          const hasSource = mdFiles.some((f) => f.name === "source.md");
          return {
            stamp: folder.name,
            fileCount: mdFiles.length,
            sourceUrl: hasSource
              ? `https://github.com/${owner}/${repo}/blob/${BRANCH}/${archiveBase}/${folder.name}/source.md`
              : undefined,
            viewUrl: `https://github.com/${owner}/${repo}/tree/${BRANCH}/${archiveBase}/${folder.name}`,
          };
        } catch {
          return {
            stamp: folder.name,
            fileCount: 0,
            viewUrl: `https://github.com/${owner}/${repo}/tree/${BRANCH}/${archiveBase}/${folder.name}`,
          };
        }
      }),
  );

  return Response.json({ archives });
}
