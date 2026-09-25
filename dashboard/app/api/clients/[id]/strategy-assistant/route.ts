/**
 * Agente de Estrategia — ayuda al DIRECTOR a redactar la estrategia
 * mensual de un cliente (la nota que sale en el PDF del roadmap).
 *
 * Stateless (no persiste hilo): el director pide, el agente devuelve el
 * texto de la estrategia listo para pegar/editar en el editor.
 *
 *   POST { instruction: string, current?: string, month?: string }
 *     → { text }
 *
 * Auth: SOLO director (la estrategia la escribe/edita solo el director).
 * Reusa el contexto del Consultor de Contenido (marca + vault + estrategia
 * + tendencias + aprendizajes) para que la propuesta esté alineada.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { requireClientAccess } from "@/lib/auth-guard";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { CLAUDE_MODEL_SONNET } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";
import { buildContentConsultantContext } from "@/lib/content-consultant";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Sos el agente creativo/estratega de Dearmas & Costantini (D&C). Ayudás al DIRECTOR a redactar la ESTRATEGIA MENSUAL de contenido y marketing de un cliente. Esa estrategia se muestra en el calendario y sale en el PDF del roadmap.

CÓMO ESCRIBÍS:
- Español rioplatense, directo, accionable. Nada de relleno ni de "en el vertiginoso mundo del marketing".
- Breve y concreto: que el equipo lo lea en 30 segundos y sepa qué hacer.
- Markdown simple: títulos cortos (##) y bullets. Sin tablas ni bloques largos.

QUÉ INCLUIR (adaptá a lo que pida el director y al contexto del cliente):
- Foco / campaña principal del mes.
- Prioridades y ángulos/hooks concretos.
- Fechas clave del mes (comerciales/estacionales) y cómo aprovecharlas.
- Pauta sugerida si aplica.
- Qué medir (1-3 métricas).

REGLAS:
- NO inventes datos que no estén en el contexto (presupuestos, resultados). Si falta algo, dejalo como sugerencia explícita ("Sugerencia: definir pauta").
- Si el director te pasa una estrategia actual, MEJORALA/REESCRIBILA según su pedido, no empieces de cero salvo que lo pida.
- Devolvé SOLO el texto de la estrategia en markdown, sin preámbulo, sin comillas, sin "acá tenés".`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const access = await requireClientAccess(req, clientId);
  if (!access.ok) return access.response;
  // La estrategia la escribe/edita SOLO el director.
  if (access.role !== "director") {
    return Response.json(
      { error: "La estrategia la redacta solo el director." },
      { status: 403 },
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return Response.json(
      { error: "Servidor no configurado (falta ANTHROPIC_API_KEY)." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    instruction?: string;
    current?: string;
    month?: string;
  };
  const instruction = (body.instruction ?? "").trim();
  const current = (body.current ?? "").trim();
  const month = (body.month ?? "").trim();
  if (!instruction) {
    return Response.json({ error: "Falta el pedido." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const ctx = await buildContentConsultantContext(admin, clientId);

  const systemBlocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: ctx.contextBlock },
  ];
  if (ctx.vaultBlock)
    systemBlocks.push({
      type: "text",
      text: ctx.vaultBlock,
      cache_control: { type: "ephemeral" },
    });
  if (ctx.trendsBlock)
    systemBlocks.push({ type: "text", text: ctx.trendsBlock });
  if (ctx.learningsBlock)
    systemBlocks.push({ type: "text", text: ctx.learningsBlock });

  const userMsg = [
    month ? `Mes objetivo: ${month}.` : "",
    current
      ? `Estrategia actual (mejorala/reescribila según el pedido):\n"""\n${current}\n"""`
      : "Todavía no hay estrategia escrita para este mes.",
    `Pedido del director:\n${instruction}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  let response;
  try {
    response = await anthropic.messages.create({
      model: CLAUDE_MODEL_SONNET,
      max_tokens: 1500,
      system: systemBlocks,
      messages: [{ role: "user", content: userMsg }],
    });
  } catch (err) {
    console.error("[strategy-assistant] anthropic error:", err);
    return Response.json(
      {
        error: "El agente no pudo responder.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const text =
    textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

  await recordApiUsage({
    source: "dashboard:strategy-assistant",
    clientId,
    model: response.model,
    usage: response.usage,
  });

  return Response.json({ text });
}
