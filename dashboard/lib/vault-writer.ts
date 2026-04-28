/**
 * Vault writer — escritura de archivos del vault desde el dashboard via
 * GitHub Contents API. Espejo de `vault-loader.ts` pero para PUT.
 *
 * Usado por:
 *   /api/clients/[id]/brand   — editar archivos del brand/ desde la UI
 *
 * Flujo:
 *   1. GET el archivo actual para obtener su SHA (GitHub lo requiere para
 *      detectar conflictos — si dos editores cambian al mismo tiempo, el
 *      segundo PUT falla y no piso silencioso).
 *   2. PUT con el contenido nuevo (base64) + SHA + commit message.
 *   3. Invalidar cache del vault-loader para ese cliente.
 *
 * Env vars:
 *   GH_DISPATCH_TOKEN — debe tener Contents:write
 *   GITHUB_OWNER, GITHUB_REPO
 */

import { invalidateClientCache } from "./vault-loader";

const GITHUB_API = "https://api.github.com";
const BRANCH = "main";

interface FileMeta {
  sha: string;
  content: string; // base64
}

async function getFileMeta(repoPath: string): Promise<FileMeta | null> {
  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    throw new Error(
      "vault-writer: faltan env vars (GH_DISPATCH_TOKEN / GITHUB_OWNER / GITHUB_REPO)",
    );
  }

  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${repoPath}?ref=${BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `vault-writer: GET ${res.status} para ${repoPath}`,
    );
  }
  const data = (await res.json()) as { sha: string; content: string };
  return { sha: data.sha, content: data.content };
}

interface WriteOptions {
  /** path relativo al repo, e.g. "vault/clients/wiztrip/brand/positioning.md" */
  repoPath: string;
  /** contenido nuevo del archivo (string UTF-8, será encodeado a base64) */
  content: string;
  /** mensaje de commit; default genera uno razonable */
  commitMessage?: string;
  /** committer name; default "dashboard-editor" */
  committerName?: string;
  /** committer email; default "noreply@dc-scale" */
  committerEmail?: string;
  /** clientId para invalidar cache después del write */
  clientId?: string;
}

export interface WriteResult {
  ok: boolean;
  sha: string;
  url: string;
  created: boolean;
}

/**
 * Crea o actualiza un archivo del vault. Retorna el nuevo SHA.
 *
 * Si el archivo no existía → lo crea (commit message: "Crear …").
 * Si existía → lo actualiza (commit message: "Actualizar …").
 *
 * Si querés un mensaje custom, pasá `commitMessage`.
 */
export async function writeVaultFile({
  repoPath,
  content,
  commitMessage,
  committerName = "dashboard-editor",
  committerEmail = "noreply@dc-scale",
  clientId,
}: WriteOptions): Promise<WriteResult> {
  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) {
    throw new Error(
      "vault-writer: faltan env vars (GH_DISPATCH_TOKEN / GITHUB_OWNER / GITHUB_REPO)",
    );
  }

  const existing = await getFileMeta(repoPath);
  const created = existing === null;
  const message =
    commitMessage ??
    `${created ? "Crear" : "Actualizar"} ${repoPath} desde dashboard`;

  // Encode UTF-8 a base64 (Buffer está disponible en Node runtime de Vercel)
  const contentB64 = Buffer.from(content, "utf-8").toString("base64");

  const body: Record<string, unknown> = {
    message,
    content: contentB64,
    branch: BRANCH,
    committer: { name: committerName, email: committerEmail },
  };
  if (existing) body.sha = existing.sha;

  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${repoPath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `vault-writer: PUT ${res.status} para ${repoPath}: ${errBody.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as {
    content: { sha: string; html_url: string };
  };

  if (clientId) {
    invalidateClientCache(clientId);
  }

  return {
    ok: true,
    sha: data.content.sha,
    url: data.content.html_url,
    created,
  };
}
