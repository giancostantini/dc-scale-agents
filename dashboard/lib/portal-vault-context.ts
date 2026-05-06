/**
 * Portal vault context — versión filtrada de `vault-loader.ts` para el
 * Consultor-Cliente (`/api/portal/consultant` y `/welcome`).
 *
 * El Consultor-Agencia (`/api/consultant`, lo usan director/team) lee
 * TODO el vault del cliente vía `loadClientVaultContext()`. Acá NO. Acá
 * solo cargamos los archivos que el cliente puede ver públicamente,
 * porque el principio es "defensa en profundidad": si el endpoint del
 * cliente nunca carga `learning-log.md` ni `calls-log.md`, no hay forma
 * de que un mensaje malicioso del cliente le saque ese contenido al
 * consultor — ni siquiera lo tiene en contexto.
 *
 * Convención (también documentada en dashboard/CLAUDE.md):
 *   ✓ Visible al cliente: claude-client.md, strategy.md, brand/*,
 *     content-{library,calendar}.md, ads-library.md, seo-library.md,
 *     metrics-log.md, performance-log.md
 *   ✗ Solo equipo DC: learning-log.md, calls-log.md, _archive/*
 *
 * Si el equipo necesita escribir algo crítico que el cliente NO debe
 * ver (ej. "cliente paga tarde, considerar suspender"), va a
 * learning-log.md o calls-log.md.
 */

import {
  fetchVaultFile,
  loadClientBrand,
} from "./vault-loader";

export interface PortalVaultContext {
  claudeClient: string | null;
  strategy: string | null;
  /** brand/<filename>.md → contenido. Map vacío si no hay brand/. */
  brand: Record<string, string>;
  contentLibrary: string | null;
  contentCalendar: string | null;
  adsLibrary: string | null;
  seoLibrary: string | null;
  metricsLog: string | null;
  performanceLog: string | null;
}

/**
 * Carga en paralelo solo los archivos visibles al cliente.
 * No incluye learning-log.md ni calls-log.md por privacidad.
 */
export async function loadClientVaultForPortal(
  clientId: string,
): Promise<PortalVaultContext> {
  if (!clientId || typeof clientId !== "string") {
    throw new Error("loadClientVaultForPortal: clientId requerido");
  }

  const base = `vault/clients/${clientId}`;

  const [
    claudeClient,
    strategy,
    contentLibrary,
    contentCalendar,
    adsLibrary,
    seoLibrary,
    metricsLog,
    performanceLog,
    brand,
  ] = await Promise.all([
    fetchVaultFile(`${base}/claude-client.md`).catch(() => null),
    fetchVaultFile(`${base}/strategy.md`).catch(() => null),
    fetchVaultFile(`${base}/content-library.md`).catch(() => null),
    fetchVaultFile(`${base}/content-calendar.md`).catch(() => null),
    fetchVaultFile(`${base}/ads-library.md`).catch(() => null),
    fetchVaultFile(`${base}/seo-library.md`).catch(() => null),
    fetchVaultFile(`${base}/metrics-log.md`).catch(() => null),
    fetchVaultFile(`${base}/performance-log.md`).catch(() => null),
    loadClientBrand(clientId).catch((err) => {
      console.warn(
        `[portal-vault-context] loadClientBrand falló para ${clientId}:`,
        err.message,
      );
      return {} as Record<string, string>;
    }),
  ]);

  return {
    claudeClient,
    strategy,
    brand,
    contentLibrary,
    contentCalendar,
    adsLibrary,
    seoLibrary,
    metricsLog,
    performanceLog,
  };
}

/**
 * Convierte el vault filtrado en un bloque markdown para inyectar en
 * el system prompt de Claude. Si la suma supera maxChars (default
 * 18000) recorta proporcionalmente para no quemar tokens en cosas
 * que el modelo no va a usar igual.
 *
 * El brandbook (vault.brand) se renderiza como sub-secciones porque
 * cada archivo tiene un foco distinto (positioning, voice, visual,
 * etc.) y eso le permite al modelo referenciar la sección correcta
 * cuando el cliente pregunta algo específico.
 */
export function buildPortalVaultBlock(
  vault: PortalVaultContext,
  maxChars = 18000,
): string {
  const BRAND_TITLES: Record<string, string> = {
    positioning: "Positioning",
    "voice-operational": "Voz Operativa",
    "voice-character": "Voz del Personaje",
    "voice-decision": "Decisión de Voz",
    "visual-identity": "Identidad Visual",
    photography: "Fotografía",
    "content-formats": "Formatos de Contenido",
    restrictions: "Restricciones",
  };

  const overviewSections: Array<{ title: string; body: string | null }> = [
    { title: "Overview del cliente (claude-client.md)", body: vault.claudeClient },
    { title: "Estrategia activa (strategy.md)", body: vault.strategy },
    { title: "Biblioteca de contenido (content-library.md)", body: vault.contentLibrary },
    { title: "Calendario de contenido (content-calendar.md)", body: vault.contentCalendar },
    { title: "Biblioteca de ads (ads-library.md)", body: vault.adsLibrary },
    { title: "Biblioteca SEO (seo-library.md)", body: vault.seoLibrary },
    { title: "Histórico de métricas (metrics-log.md)", body: vault.metricsLog },
    { title: "Histórico de performance (performance-log.md)", body: vault.performanceLog },
  ];

  const brandEntries = Object.entries(vault.brand)
    .filter(([, body]) => body && body.trim().length > 0)
    .map(([key, body]) => ({
      title: `brand/${key} (${BRAND_TITLES[key] ?? key})`,
      body,
    }));

  const filledOverview = overviewSections.filter(
    (s) => s.body && s.body.trim().length > 0,
  );

  if (filledOverview.length === 0 && brandEntries.length === 0) {
    return "VAULT DEL CLIENTE: (vacío — el equipo aún no cargó contenido textual sobre este cliente).";
  }

  const totalRaw =
    filledOverview.reduce((acc, s) => acc + (s.body?.length ?? 0), 0) +
    brandEntries.reduce((acc, e) => acc + e.body.length, 0);

  if (totalRaw <= maxChars) {
    const parts: string[] = [
      "VAULT DEL CLIENTE (contenido textual cargado por el equipo — usalo como fuente, citalo cuando ayude):",
    ];
    for (const s of filledOverview) {
      parts.push(`\n## ${s.title}\n${s.body}`);
    }
    if (brandEntries.length > 0) {
      parts.push("\n## Brandbook estructurado (brand/)");
      for (const e of brandEntries) {
        parts.push(`\n### ${e.title}\n${e.body}`);
      }
    }
    return parts.join("\n");
  }

  // Recorte proporcional con piso de 400 chars por sección.
  const sectionsCount = filledOverview.length + brandEntries.length;
  const budget = Math.max(maxChars - sectionsCount * 100, 2000);
  const parts: string[] = [
    "VAULT DEL CLIENTE (recortado por tamaño — citá las partes que tengas):",
  ];
  for (const s of filledOverview) {
    const share = Math.max(
      400,
      Math.floor((s.body!.length / totalRaw) * budget),
    );
    const slice = s.body!.slice(0, share);
    const truncated = slice.length < s.body!.length ? "\n…[recortado]" : "";
    parts.push(`\n## ${s.title}\n${slice}${truncated}`);
  }
  if (brandEntries.length > 0) {
    parts.push("\n## Brandbook estructurado (brand/)");
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
 * Hash del contenido del vault para detectar si cambió desde la última
 * vez. Lo usa el welcome endpoint para invalidar el cache cuando el
 * equipo edita un archivo del vault del cliente.
 *
 * Solo hashea longitud + primeros 200 chars de cada archivo — alcanza
 * para detectar cambios sustanciales sin tener que mover todo el
 * contenido por la pipeline de hash.
 */
export function vaultSignatureFragment(vault: PortalVaultContext): string {
  const fingerprint = (s: string | null): string => {
    if (!s) return "n";
    return `${s.length}:${s.slice(0, 200)}`;
  };
  return JSON.stringify({
    cc: fingerprint(vault.claudeClient),
    st: fingerprint(vault.strategy),
    cl: fingerprint(vault.contentLibrary),
    cc_cal: fingerprint(vault.contentCalendar),
    al: fingerprint(vault.adsLibrary),
    sl: fingerprint(vault.seoLibrary),
    ml: fingerprint(vault.metricsLog),
    pl: fingerprint(vault.performanceLog),
    brand: Object.entries(vault.brand)
      .map(([k, v]) => `${k}:${fingerprint(v)}`)
      .sort(),
  });
}
