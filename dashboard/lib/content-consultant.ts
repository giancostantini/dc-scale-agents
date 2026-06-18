/**
 * Consultor de Contenido — system prompt + armado de contexto.
 *
 * Agente del portal de EQUIPO (director / team) que da ideas de contenido
 * por cliente, nutrido de:
 *   1. Marca + documentos del cliente (vault COMPLETO: brandbook de 8
 *      archivos, estrategia, learning-log, overview).
 *   2. Últimas tendencias del nicho (agente sector-trends).
 *   3. Datos Supabase (objetivos/KPIs, contenido ya publicado, fase…).
 *
 * Reusa los loaders ya probados por el consultor global del equipo
 * (consultant-global-context.ts): loadClientContext + loadClientVaultContext.
 *
 * NO confundir con el Consultor del cliente (/api/portal/consultant): ese es
 * para el dueño del negocio y filtra el contexto. Éste es interno y ve todo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadClientContext,
  buildClientContextBlock,
} from "@/lib/consultant-context";
import { loadClientVaultContext, buildVaultBlock } from "@/lib/vault-loader";
import { getLatestSectorTrends } from "@/lib/sector-trends";

export const CONTENT_CONSULTANT_SYSTEM_PROMPT = `Sos el Consultor de Contenido de Dearmas Costantini (D&C), trabajando para el EQUIPO interno (director + equipo creativo), no para el cliente. Tu trabajo: proponer ideas de contenido concretas y accionables para el cliente sobre el que te preguntan, alineadas a DOS cosas a la vez:

1) LA IDENTIDAD DE MARCA del cliente — su posicionamiento, voz, formatos y restricciones (del brandbook y la estrategia que tenés en contexto).
2) LAS TENDENCIAS DEL NICHO — lo que está funcionando AHORA en el mercado (del bloque de tendencias; formatos/hooks que crecen, lo que trae tráfico y convierte).

CÓMO PENSÁS UNA IDEA:
- Partís de una tendencia o insight real (citá cuál) y la bajás a la marca: cómo se ve ESA tendencia hablada con la voz y el ángulo de ESTE cliente.
- Nada genérico ("subí un Reel mostrando el producto"). Cada idea tiene que ser específica del cliente y del momento.
- Respetás las restricciones de marca (lo que el cliente NO hace/dice). Si una tendencia choca con la marca, decilo y adaptala.
- Evitás repetir lo que el cliente ya publicó (lo tenés en el contexto). Buscás ángulos nuevos.

FORMATO DE CADA IDEA (cuando proponés ideas, usá esta estructura por idea, en markdown):
- **Gancho / título** — la frase o hook con el que abre.
- **Formato** — Reel / carrusel / story / post / UGC / anuncio.
- **Ángulo** — el enfoque o narrativa, en la voz de la marca.
- **Por qué ahora** — a qué tendencia o insight de marca responde (citá la fuente: "según la tendencia X" o "según tu brand/positioning").

Por defecto proponé entre 3 y 5 ideas, salvo que te pidan otra cantidad. Cuando te pidan iterar ("más de Reels", "enfocate en la promo de invierno", "ángulos para tal producto"), seguí la conversación.

VOZ DE D&C (cómo escribís vos, el consultor):
- Directa, sin jerga consultora. Prohibido: "sinergia", "potenciar", "transformar", "valor agregado", "ecosistema", "disrupción".
- Concreto sobre abstracto: ejemplos, verbos de acción, especificidad.
- Español rioplatense (vos, tu marca).
- Sos un par del equipo creativo, no un cliente: podés hablar de tácticas, hooks, métricas internas.

REGLAS:
- NO inventés datos del cliente. Si algo no está en el contexto, decí "no veo eso cargado" y proponé igual con lo que hay.
- Si NO hay tendencias cargadas todavía, avisá ("todavía no corrió el agente de tendencias para este cliente") y proponé ideas alineadas a la marca igual.
- Markdown limpio. Sin preámbulos largos: andá a las ideas.`;

const TRENDS_MAX_CHARS = 4000;

interface TrendItemLike {
  title?: string;
  summary?: string;
  category?: string;
}

/** Bloque de tendencias recientes del nicho (del agente sector-trends). */
async function buildTrendsBlock(clientId: string): Promise<string | null> {
  let trends;
  try {
    trends = await getLatestSectorTrends(clientId);
  } catch {
    return null;
  }
  if (!trends) return null;

  let body = "";
  if (trends.bodyMd && trends.bodyMd.trim()) {
    body = trends.bodyMd.trim();
  } else if (Array.isArray(trends.items) && trends.items.length > 0) {
    body = (trends.items as TrendItemLike[])
      .map(
        (it, i) =>
          `${i + 1}. ${it.title ?? "(sin título)"}${
            it.summary ? `\n   ${it.summary}` : ""
          }`,
      )
      .join("\n");
  }
  if (!body.trim()) return null;

  const truncated =
    body.length > TRENDS_MAX_CHARS
      ? body.slice(0, TRENDS_MAX_CHARS) + "\n…(truncado)"
      : body;
  const when = trends.generatedAt
    ? ` (actualizadas ${String(trends.generatedAt).slice(0, 10)})`
    : "";

  return [
    `TENDENCIAS DEL NICHO${when} — del agente sector-trends:`,
    "Alineá las ideas a lo que funciona AHORA en el nicho (formatos/hooks que",
    "crecen, lo que trae tráfico, lo que convierte). Son señales EXTERNAS del",
    "mercado; combinalas con la identidad de marca y los datos propios del cliente.",
    "",
    truncated,
  ].join("\n");
}

export interface ContentConsultantContext {
  /** Datos Supabase del cliente (objetivos, contenido publicado, fase…). */
  contextBlock: string;
  /** Vault completo: marca (8 archivos) + estrategia + learning-log + overview. */
  vaultBlock: string | null;
  /** Tendencias recientes del nicho. */
  trendsBlock: string | null;
  clientName: string;
}

/**
 * Arma el contexto completo del Consultor de Contenido en paralelo.
 * Reusa los loaders del consultor global + el helper de tendencias.
 */
export async function buildContentConsultantContext(
  admin: SupabaseClient,
  clientId: string,
): Promise<ContentConsultantContext> {
  const [bundle, vault, trendsBlock] = await Promise.all([
    loadClientContext(admin, clientId),
    loadClientVaultContext(clientId).catch(() => null),
    buildTrendsBlock(clientId),
  ]);

  return {
    contextBlock: bundle
      ? buildClientContextBlock(bundle)
      : "CONTEXTO DEL CLIENTE: (sin datos en Supabase todavía).",
    vaultBlock: vault ? buildVaultBlock(vault) : null,
    trendsBlock,
    clientName: bundle?.client?.name ?? clientId,
  };
}
