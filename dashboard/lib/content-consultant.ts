/**
 * Consultor de Contenido — system prompt + armado de contexto.
 *
 * Agente del portal de EQUIPO (director / team), pensado sobre todo para
 * el/la Community Manager (CM): ayuda a ESCRIBIR EL TEXTO de las placas /
 * statics (título en imagen, bajada, CTA visual, textos de carrusel,
 * frases para stories) y da referencias de cómo redactarlo, alineado a:
 *   1. La marca del cliente (voz, formatos, restricciones — del brandbook).
 *   2. Las últimas tendencias del nicho (agente sector-trends).
 *   3. Datos Supabase (qué se publicó ya, para no repetir).
 *
 * NO es estrategia ni ángulos de campaña: es el TEXTO que se tipea en la
 * pieza. Reusa los loaders del consultor global (loadClientContext +
 * loadClientVaultContext). No confundir con el Consultor del cliente
 * (/api/portal/consultant), que es para el dueño del negocio.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadClientContext,
  buildClientContextBlock,
} from "@/lib/consultant-context";
import { loadClientVaultContext, buildVaultBlock } from "@/lib/vault-loader";
import { getLatestSectorTrends } from "@/lib/sector-trends";

export const CONTENT_CONSULTANT_SYSTEM_PROMPT = `Sos el Consultor de Contenido de Dearmas Costantini (D&C), para el EQUIPO interno — principalmente el/la Community Manager (CM) que diseña y publica las placas (statics). Tu trabajo NO es la estrategia ni los ángulos de campaña: es ayudar a ESCRIBIR EL TEXTO QUE VA EN LAS PIEZAS (placas/statics, carruseles, stories) y dar referencias de cómo redactarlo, alineado a la marca del cliente y a las tendencias del nicho.

QUÉ TE PIDEN Y QUÉ ENTREGÁS:
- Texto PARA LA IMAGEN: el título / gancho visual, la bajada de apoyo y el CTA visual si va. Texto listo para tipear en la placa, no consejos abstractos.
- Carruseles: el texto placa por placa (Placa 1, Placa 2, …), con la idea de cada slide.
- Stories: frases cortas para el texto, stickers, encuestas.
- Referencias e inspiración: cómo se escribe ese tipo de texto en el nicho, qué fórmulas de "copy en placa" están funcionando ahora (usá el bloque de tendencias).
- Cuando tenga sentido, ofrecé 2-3 VARIANTES por placa para que la CM elija.

CÓMO SE ESCRIBE EL TEXTO DE PLACAS (reglas de oficio):
- Pocas palabras: en una placa entra poco texto. Gancho de 3 a 7 palabras; bajada de una línea. Si es largo, no entra ni se lee.
- Una idea por placa, jerarquía clara: Título grande + apoyo chico + CTA.
- Que el primer renglón haga frenar el scroll: concreto, con tensión o beneficio claro. Nada genérico.
- Respetá la VOZ y las RESTRICCIONES de la marca (palabras y temas que el cliente NO usa). Si tenés brand/voice-*, brand/content-formats y brand/restrictions en contexto, seguilos al pie.
- Evitá clichés de copy: prohibido "potenciar", "transformar", "sinergia", "valor agregado", "ecosistema".

FORMATO DE RESPUESTA (markdown, accionable para copiar y pegar):
- Placa simple →
  **Placa — [tema]**
  - Título (en imagen): "…"
  - Bajada: "…"
  - CTA visual: "…"  (si corresponde)
- Carrusel → lista "Placa 1 / Placa 2 / …" con el texto de cada una.
- Variantes → numeralas (Opción A / B / C).
- Cortito: la CM tiene que poder pegar el texto directo en la pieza.

VOZ DE D&C (cómo hablás vos, el consultor):
- Directa, práctica, de par a par con la CM. Español rioplatense (vos).
- Sin sermones de estrategia: vas directo al texto.

REGLAS:
- NO inventés datos del cliente. Si algo no está en el contexto, decilo y proponé igual con lo que hay.
- Si NO hay tendencias cargadas todavía, avisá ("todavía no corrió el agente de tendencias para este cliente") y proponé igual alineado a la marca.
- Markdown limpio, sin preámbulos largos: andá al texto.`;

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
    "Usá esto para los textos de las placas: qué frases/fórmulas de copy-en-imagen",
    "están funcionando ahora, qué temas y hooks traccionan. Son señales EXTERNAS",
    "del mercado; combinalas con la voz de la marca y lo que ya publicó el cliente.",
    "",
    truncated,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Memoria / aprendizajes del cliente (consultant_memory_v2).
// Acá es donde el destilador semanal (scripts/distill-learnings) escribe
// kind='learning', y donde el equipo deja directivas vía el Consultor. Leerla
// es lo que hace que el consultor "se afine" con el tiempo. Bloque chico y
// acotado (no crece con el historial) → costo por llamada plano.
// ---------------------------------------------------------------------------

const MEMORY_KIND_LABEL: Record<string, string> = {
  constraint: "Restricción",
  preference: "Preferencia",
  past_decision: "Decisión previa",
  learning: "Aprendizaje",
};
// Reglas duras primero, aprendizajes al final.
const MEMORY_KIND_ORDER = ["constraint", "preference", "past_decision", "learning"];

interface ClientMemoryRow {
  kind: string;
  content: string;
  importance: number;
}

async function loadClientLearnings(
  admin: SupabaseClient,
  clientId: string,
): Promise<ClientMemoryRow[]> {
  const { data, error } = await admin
    .from("consultant_memory_v2")
    .select("kind, content, importance")
    .eq("scope_type", "client")
    .eq("client_id", clientId)
    .or("expires_at.is.null,expires_at.gt.now()")
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(25);
  if (error || !data) return [];
  return data as ClientMemoryRow[];
}

/** Bloque de directivas + aprendizajes para el system prompt. null si no hay. */
function buildLearningsBlock(rows: ClientMemoryRow[]): string | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort(
    (a, b) =>
      MEMORY_KIND_ORDER.indexOf(a.kind) - MEMORY_KIND_ORDER.indexOf(b.kind),
  );
  return [
    "--- DIRECTIVAS Y APRENDIZAJES DEL EQUIPO (memoria de este cliente) ---",
    "Lo que el equipo pidió para este cliente + lo aprendido de charlas previas",
    "(se afina con el tiempo). Tienen PRIORIDAD sobre tu criterio general; las",
    "restricciones son reglas duras (nunca violarlas).",
    ...sorted.map((r) => `- [${MEMORY_KIND_LABEL[r.kind] ?? r.kind}] ${r.content}`),
  ].join("\n");
}

export interface ContentConsultantContext {
  /** Datos Supabase del cliente (contenido publicado, objetivos, fase…). */
  contextBlock: string;
  /** Vault completo: marca (8 archivos) + estrategia + learning-log + overview. */
  vaultBlock: string | null;
  /** Tendencias recientes del nicho. */
  trendsBlock: string | null;
  /** Directivas + aprendizajes acumulados (memoria del cliente). */
  learningsBlock: string | null;
  clientName: string;
}

/**
 * Arma el contexto completo del Consultor de Contenido en paralelo.
 * Reusa los loaders del consultor global + el helper de tendencias + la
 * memoria del cliente (aprendizajes acumulados).
 */
export async function buildContentConsultantContext(
  admin: SupabaseClient,
  clientId: string,
): Promise<ContentConsultantContext> {
  const [bundle, vault, trendsBlock, memory] = await Promise.all([
    loadClientContext(admin, clientId),
    loadClientVaultContext(clientId).catch(() => null),
    buildTrendsBlock(clientId),
    loadClientLearnings(admin, clientId).catch(() => []),
  ]);

  return {
    contextBlock: bundle
      ? buildClientContextBlock(bundle)
      : "CONTEXTO DEL CLIENTE: (sin datos en Supabase todavía).",
    vaultBlock: vault ? buildVaultBlock(vault) : null,
    trendsBlock,
    learningsBlock: buildLearningsBlock(memory),
    clientName: bundle?.client?.name ?? clientId,
  };
}
