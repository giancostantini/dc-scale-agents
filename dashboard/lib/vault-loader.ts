/**
 * Vault loader — fetcha archivos del vault desde GitHub para que el código que
 * corre en Vercel (Consultor + agentes fast-path) tenga acceso al contexto
 * narrativo del cliente sin depender del filesystem del bundle.
 *
 * Estrategia:
 * - Lee desde GitHub Contents API con `Accept: application/vnd.github.raw`,
 *   usando `GH_DISPATCH_TOKEN` (ya configurado en Vercel) — funciona para
 *   repos privados.
 * - Cachea cada archivo 5 min en memoria del proceso. La caché se reinicia
 *   con cada cold-start de Vercel function, lo cual está bien porque:
 *     a) los warm invocations dentro de la misma función comparten cache,
 *     b) cuando un agente commitea cambios al vault desde GHA, la caché en
 *        otro proceso de Vercel queda obsoleta hasta máx 5 min — aceptable.
 * - Si un archivo no existe (404), retorna null (no es error). Eso permite
 *   que clientes recién creados sin vault aún funcionen.
 *
 * Env vars consumidas:
 *   GH_DISPATCH_TOKEN — fine-grained PAT con Contents:read sobre el repo
 *   GITHUB_OWNER      — e.g. "giancostantini"
 *   GITHUB_REPO       — e.g. "dc-scale-agents"
 */

const GITHUB_API = "https://api.github.com";
const TTL_MS = 5 * 60 * 1000; // 5 min
const BRANCH = "main";

interface CacheEntry {
  value: string | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Fetcha un archivo del repo via Contents API (raw). Cache 5 min.
 * Retorna null si el archivo no existe (404). Throw en otros errores.
 */
export async function fetchVaultFile(repoPath: string): Promise<string | null> {
  const cached = cache.get(repoPath);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error(
      "vault-loader: faltan env vars (GH_DISPATCH_TOKEN / GITHUB_OWNER / GITHUB_REPO)",
    );
  }

  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${repoPath}?ref=${BRANCH}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (res.status === 404) {
    cache.set(repoPath, { value: null, expires: Date.now() + TTL_MS });
    return null;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `vault-loader: GitHub Contents API ${res.status} para ${repoPath}: ${body.slice(0, 200)}`,
    );
  }

  const text = await res.text();
  cache.set(repoPath, { value: text, expires: Date.now() + TTL_MS });
  return text;
}

export interface ClientVaultContext {
  claudeClient: string | null;
  strategy: string | null;
  learningLog: string | null;
  callsLog: string | null;
}

/**
 * Cargá el contexto rico del cliente (4 archivos) en paralelo. Usado por:
 * - Consultor route → para enriquecer el system prompt
 * - /api/agents/run fast-path → para precargar contexto antes de invocar
 *   el agente in-process
 */
export async function loadClientVaultContext(
  clientId: string,
): Promise<ClientVaultContext> {
  if (!clientId || typeof clientId !== "string") {
    throw new Error("loadClientVaultContext: clientId requerido");
  }

  const base = `vault/clients/${clientId}`;
  const [claudeClient, strategy, learningLog, callsLog] = await Promise.all([
    fetchVaultFile(`${base}/claude-client.md`),
    fetchVaultFile(`${base}/strategy.md`),
    fetchVaultFile(`${base}/learning-log.md`),
    fetchVaultFile(`${base}/calls-log.md`),
  ]);

  return { claudeClient, strategy, learningLog, callsLog };
}

/**
 * Renderiza el contexto del vault como un bloque para inyectar en el system
 * prompt del Consultor. Recorta cada archivo si total > maxChars (default
 * 8000) para no sacar de tokens cosas que importan más (memory, runs, etc).
 */
export function buildVaultBlock(
  vault: ClientVaultContext,
  maxChars = 8000,
): string {
  const sections: Array<{ title: string; body: string | null }> = [
    { title: "BRANDBOOK / CONTEXTO DE MARCA", body: vault.claudeClient },
    { title: "ESTRATEGIA ACTUAL", body: vault.strategy },
    { title: "APRENDIZAJES ACUMULADOS", body: vault.learningLog },
    { title: "REGISTRO DE LLAMADAS / NOTAS", body: vault.callsLog },
  ];

  const present = sections.filter((s) => s.body && s.body.trim().length > 0);
  if (present.length === 0) {
    return "VAULT DEL CLIENTE: (vacío — el cliente todavía no tiene contexto cargado)";
  }

  // Reparto presupuesto de chars proporcional al tamaño de cada sección,
  // con piso de 500 chars por sección presente.
  const totalRaw = present.reduce((acc, s) => acc + (s.body?.length ?? 0), 0);
  if (totalRaw <= maxChars) {
    return [
      "VAULT DEL CLIENTE:",
      ...present.map((s) => `\n## ${s.title}\n${s.body}`),
    ].join("\n");
  }

  const budget = Math.max(maxChars - present.length * 100, 1000);
  const out: string[] = ["VAULT DEL CLIENTE: (recortado por tamaño)"];
  for (const s of present) {
    const share = Math.max(
      500,
      Math.floor((s.body!.length / totalRaw) * budget),
    );
    const slice = s.body!.slice(0, share);
    const truncated = slice.length < s.body!.length ? "\n…[recortado]" : "";
    out.push(`\n## ${s.title}\n${slice}${truncated}`);
  }
  return out.join("\n");
}

/**
 * Helper para tests/debug. No usar en producción.
 */
export function _resetVaultCache(): void {
  cache.clear();
}
