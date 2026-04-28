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

interface DirCacheEntry {
  files: string[];
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const dirCache = new Map<string, DirCacheEntry>();

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
  /** brand/<filename>.md → contenido. Map vacío si el cliente no tiene brand/. */
  brand: Record<string, string>;
}

/**
 * Lista los archivos `.md` directos de `vault/clients/<id>/brand/` (sin
 * recursión) excluyendo `_archive/` y subcarpetas. Cache 5 min.
 *
 * Retorna `[]` si el folder no existe (cliente sin brandbook procesado).
 */
export async function listClientBrandFiles(clientId: string): Promise<string[]> {
  const cacheKey = `dir:vault/clients/${clientId}/brand`;
  const cached = dirCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.files;
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error(
      "vault-loader: faltan env vars (GH_DISPATCH_TOKEN / GITHUB_OWNER / GITHUB_REPO)",
    );
  }

  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/vault/clients/${clientId}/brand?ref=${BRANCH}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (res.status === 404) {
    dirCache.set(cacheKey, { files: [], expires: Date.now() + TTL_MS });
    return [];
  }

  if (!res.ok) {
    throw new Error(
      `vault-loader: GitHub list ${res.status} para brand/ de ${clientId}`,
    );
  }

  type DirEntry = { type: string; name: string };
  const entries = (await res.json()) as DirEntry[];
  const files = entries
    .filter((e) => e.type === "file" && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();

  dirCache.set(cacheKey, { files, expires: Date.now() + TTL_MS });
  return files;
}

/**
 * Cargá todos los archivos del `brand/` del cliente en paralelo.
 * Retorna un map `{ "positioning": "...", "voice-operational": "...", ... }`
 * (sin extensión `.md` en los keys para inyección más limpia).
 */
export async function loadClientBrand(
  clientId: string,
): Promise<Record<string, string>> {
  const files = await listClientBrandFiles(clientId);
  if (files.length === 0) return {};

  const base = `vault/clients/${clientId}/brand`;
  const contents = await Promise.all(
    files.map((f) => fetchVaultFile(`${base}/${f}`)),
  );

  const out: Record<string, string> = {};
  for (let i = 0; i < files.length; i++) {
    const content = contents[i];
    if (content) {
      const key = files[i].replace(/\.md$/, "");
      out[key] = content;
    }
  }
  return out;
}

/**
 * Cargá el contexto rico del cliente (4 archivos overview + brand/) en paralelo.
 * Usado por:
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
  const [claudeClient, strategy, learningLog, callsLog, brand] = await Promise.all([
    fetchVaultFile(`${base}/claude-client.md`),
    fetchVaultFile(`${base}/strategy.md`),
    fetchVaultFile(`${base}/learning-log.md`),
    fetchVaultFile(`${base}/calls-log.md`),
    loadClientBrand(clientId).catch((err) => {
      console.warn(
        `[vault-loader] loadClientBrand falló para ${clientId}:`,
        err.message,
      );
      return {};
    }),
  ]);

  return { claudeClient, strategy, learningLog, callsLog, brand };
}

/**
 * Invalida la cache de un cliente — usar cuando un archivo del vault se
 * acaba de actualizar via GitHub Contents API y queremos que la próxima
 * lectura traiga la versión nueva sin esperar el TTL de 5 min.
 */
export function invalidateClientCache(clientId: string): void {
  const prefix = `vault/clients/${clientId}/`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of dirCache.keys()) {
    if (key.startsWith(`dir:${prefix}`)) dirCache.delete(key);
  }
}

/**
 * Renderiza el contexto del vault como un bloque para inyectar en el system
 * prompt del Consultor. Recorta cada archivo si total > maxChars (default
 * 16000 — antes 8000 pero ahora incluimos el brandbook seccionado) para no
 * sacar de tokens cosas que importan más (memory, runs, etc).
 *
 * El brandbook seccionado (vault.brand) se renderiza como sub-secciones
 * `### brand/<filename>` dentro de un bloque "BRANDBOOK ESTRUCTURADO" para
 * que el modelo pueda referenciar cada parte. Si el cliente no tiene
 * brand/ procesado, esa sección no aparece.
 */
export function buildVaultBlock(
  vault: ClientVaultContext,
  maxChars = 16000,
): string {
  // Mapeo de archivos del brand/ a títulos legibles (alineado con
  // scripts/brandbook-processor/index.js → SECTIONS).
  const BRAND_TITLES: Record<string, string> = {
    "positioning": "Positioning",
    "voice-operational": "Voz Operativa",
    "voice-character": "Voz del Personaje",
    "voice-decision": "Decisión de Voz",
    "visual-identity": "Identidad Visual",
    "photography": "Fotografía",
    "content-formats": "Formatos de Contenido",
    "restrictions": "Restricciones",
  };

  const overviewSections: Array<{ title: string; body: string | null }> = [
    { title: "OVERVIEW DEL CLIENTE (claude-client.md)", body: vault.claudeClient },
    { title: "ESTRATEGIA ACTUAL", body: vault.strategy },
    { title: "APRENDIZAJES ACUMULADOS", body: vault.learningLog },
    { title: "REGISTRO DE LLAMADAS / NOTAS", body: vault.callsLog },
  ];

  const brandEntries = Object.entries(vault.brand)
    .filter(([, body]) => body && body.trim().length > 0)
    .map(([key, body]) => ({
      title: `brand/${key} (${BRAND_TITLES[key] ?? key})`,
      body,
    }));

  const allSections = [
    ...overviewSections.filter((s) => s.body && s.body.trim().length > 0),
    ...brandEntries,
  ];

  if (allSections.length === 0) {
    return "VAULT DEL CLIENTE: (vacío — el cliente todavía no tiene contexto cargado)";
  }

  const totalRaw = allSections.reduce(
    (acc, s) => acc + (s.body?.length ?? 0),
    0,
  );

  if (totalRaw <= maxChars) {
    const parts: string[] = ["VAULT DEL CLIENTE:"];
    for (const s of overviewSections.filter(
      (s) => s.body && s.body.trim().length > 0,
    )) {
      parts.push(`\n## ${s.title}\n${s.body}`);
    }
    if (brandEntries.length > 0) {
      parts.push("\n## BRANDBOOK ESTRUCTURADO (brand/)");
      for (const e of brandEntries) {
        parts.push(`\n### ${e.title}\n${e.body}`);
      }
    }
    return parts.join("\n");
  }

  // Recorte proporcional al tamaño, con piso de 400 chars por sección.
  const budget = Math.max(maxChars - allSections.length * 100, 2000);
  const parts: string[] = ["VAULT DEL CLIENTE: (recortado por tamaño)"];
  for (const s of overviewSections.filter(
    (s) => s.body && s.body.trim().length > 0,
  )) {
    const share = Math.max(
      400,
      Math.floor((s.body!.length / totalRaw) * budget),
    );
    const slice = s.body!.slice(0, share);
    const truncated = slice.length < s.body!.length ? "\n…[recortado]" : "";
    parts.push(`\n## ${s.title}\n${slice}${truncated}`);
  }
  if (brandEntries.length > 0) {
    parts.push("\n## BRANDBOOK ESTRUCTURADO (brand/)");
    for (const e of brandEntries) {
      const share = Math.max(
        400,
        Math.floor((e.body.length / totalRaw) * budget),
      );
      const slice = e.body.slice(0, share);
      const truncated = slice.length < e.body.length ? "\n…[recortado]" : "";
      parts.push(`\n### ${e.title}\n${slice}${truncated}`);
    }
  }
  return parts.join("\n");
}

/**
 * Helper para tests/debug. No usar en producción.
 */
export function _resetVaultCache(): void {
  cache.clear();
}
