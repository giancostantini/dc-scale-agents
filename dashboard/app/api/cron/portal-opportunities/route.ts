/**
 * POST /api/cron/portal-opportunities — oportunidades del asesor en el portal
 *
 * Semanal (workflow "Autonomy Review", lunes). Para cada cliente Growth
 * Partner con datos suficientes (ofertas/paquetes activos, campañas de
 * Meta, relevamiento de competencia o tendencias del sector):
 *   1. Arma los datos reales (mismo contexto que el asesor del portal, sin
 *      costos de pauta).
 *   2. Sonnet devuelve 0–3 oportunidades con salida estructurada (tool_use
 *      forzado), cada una con los datos en que se apoya.
 *   3. Se validan (campos, largo, que no mencionen inversión/costos) y se
 *      guardan en portal_opportunities (mig 107), venciendo la tanda anterior.
 *   4. Copia al equipo en la campana.
 *
 * Publicación directa al cliente por decisión de Gian (2026-09-26) —
 * excepción al gate humano. Interruptor: autonomy_settings
 * 'portal_opportunity' (auto_sampled = status 'activa', visible al cliente;
 * gated = status 'interna', solo equipo).
 *
 * Body opcional: { clientId?: string, force?: boolean }. Sin force, un
 * cliente con oportunidades de los últimos 5 días se saltea.
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { CLAUDE_MODEL_SONNET } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";
import { getAutonomySetting } from "@/lib/autonomy";
import { getLatestSectorTrends } from "@/lib/sector-trends";
import { buildClientContextBlock, loadClientContext } from "@/lib/consultant-context";
import { buildPortalInsightsBlock, loadPortalInsights } from "@/lib/portal-insights";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KINDS = ["paquete", "campana", "tendencia", "competencia", "contenido"] as const;
type Kind = (typeof KINDS)[number];

interface Opportunity {
  kind: Kind;
  title: string;
  body: string;
  basis: string[];
}

const SYSTEM = `Sos el asesor de D&C Scale Partners para un cliente. Tu tarea: detectar como máximo 3 OPORTUNIDADES concretas para esta semana a partir de los datos reales que te paso, que el dueño del negocio va a leer en el inicio de su portal.

Una oportunidad es algo accionable y específico, por ejemplo:
- empujar un paquete u oferta que calza con una tendencia del sector o que la competencia no está cubriendo;
- darle más protagonismo a una campaña que rinde claramente mejor que las demás (más resultados cada 1.000 impresiones, mejor CTR o ROAS);
- aprovechar un formato o gancho que está funcionando en la competencia;
- preparar contenido para una fecha o tendencia que se viene.

Reglas:
- Cada oportunidad se apoya en al menos un dato del contexto y lo nombra en el texto y en "basis" (ej. "Campaña Verano Brasil: 34 conversaciones en 7 días").
- Nunca menciones inversión, gasto, presupuesto ni costos de pauta: no los tenés.
- No inventes números ni datos que no estén en el contexto.
- Si no hay ninguna oportunidad clara con los datos disponibles, devolvé una lista vacía. Es mejor 0 que una genérica.
- Título: máximo 80 caracteres. Texto: 1 a 3 oraciones, máximo 380 caracteres. Español rioplatense, directo, sin "potenciar", "sinergia", "transformar" ni "ecosistema".
- Recomendar no es ejecutar: si hace falta una acción, que la cargue en Solicitudes o la hable con su account lead.`;

const TOOL = {
  name: "publicar_oportunidades",
  description: "Publica las oportunidades detectadas para el cliente (0 a 3).",
  input_schema: {
    type: "object" as const,
    properties: {
      opportunities: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...KINDS] },
            title: { type: "string" },
            body: { type: "string" },
            basis: { type: "array", items: { type: "string" }, minItems: 1 },
          },
          required: ["kind", "title", "body", "basis"],
        },
      },
    },
    required: ["opportunities"],
  },
};

const COST_WORDS = /\b(invers|gast|presupuest|costo|cpc|cpa|cpm)|US\$|\$\s?\d/i;

/** Filtra lo que no cumple las reglas (mejor publicar menos que algo mal). */
function validate(raw: unknown): Opportunity[] {
  const list = (raw as { opportunities?: unknown[] } | null)?.opportunities;
  if (!Array.isArray(list)) return [];
  const out: Opportunity[] = [];
  for (const o of list.slice(0, 3)) {
    const x = o as Partial<Opportunity>;
    if (!x || !KINDS.includes(x.kind as Kind)) continue;
    const title = String(x.title ?? "").trim();
    const body = String(x.body ?? "").trim();
    const basis = Array.isArray(x.basis) ? x.basis.map(String).filter((b) => b.trim()) : [];
    if (title.length < 5 || title.length > 100 || body.length < 20 || body.length > 520) continue;
    if (basis.length === 0) continue;
    if (COST_WORDS.test(title) || COST_WORDS.test(body)) continue;
    out.push({ kind: x.kind as Kind, title, body, basis: basis.slice(0, 5) });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  let onlyClient: string | null = null;
  let force = false;
  try {
    const body = (await req.json()) as { clientId?: string; force?: boolean };
    if (typeof body?.clientId === "string") onlyClient = body.clientId;
    force = body?.force === true;
  } catch {
    // sin body
  }

  const supabase = getSupabaseAdmin();

  // Sin la migración 107 no hay dónde guardar → dormido, no roto.
  const probe = await supabase.from("portal_opportunities").select("id").limit(1);
  if (probe.error) {
    return Response.json({
      ok: true,
      configured: false,
      detail: "Falta correr la migración 107 (portal_opportunities).",
    });
  }

  const setting = await getAutonomySetting("portal_opportunity");
  const publish = setting.mode === "auto_sampled";

  let q = supabase.from("clients").select("id, name, type").eq("type", "gp");
  if (onlyClient) q = q.eq("id", onlyClient);
  const { data: clients } = await q;

  const results: { client: string; status: string; count?: number }[] = [];
  const anthropic = new Anthropic();
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();

  for (const client of clients ?? []) {
    try {
      if (!force) {
        const { count } = await supabase
          .from("portal_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .gte("created_at", fiveDaysAgo);
        if (count) {
          results.push({ client: client.id, status: "skipped: ya tiene de esta semana" });
          continue;
        }
      }

      const [bundle, insights, trends] = await Promise.all([
        loadClientContext(supabase, client.id),
        loadPortalInsights(supabase, client.id),
        getLatestSectorTrends(client.id).catch(() => null),
      ]);
      if (!bundle) {
        results.push({ client: client.id, status: "skipped: sin cliente" });
        continue;
      }

      const activeOffers = bundle.requests.filter(
        (r) => r.type === "oferta" && ["pending", "reviewing", "in_progress"].includes(r.status),
      );
      const trendItems = (trends?.items ?? []).slice(0, 8);
      const hasData =
        activeOffers.length > 0 ||
        insights.campaigns.length > 0 ||
        insights.competitors.length > 0 ||
        trendItems.length > 0;
      if (!hasData) {
        results.push({ client: client.id, status: "skipped: sin datos suficientes" });
        continue;
      }

      const trendsBlock =
        trendItems.length > 0
          ? [
              "## Tendencias del sector (última corrida)",
              ...trendItems.map((t) => {
                const it = t as { title?: string; summary?: string };
                return `- ${it.title ?? ""}${it.summary ? `: ${it.summary.slice(0, 220)}` : ""}`;
              }),
            ].join("\n")
          : "## Tendencias del sector\n- Sin corrida reciente.";

      const context = [
        buildClientContextBlock(bundle, "client"),
        buildPortalInsightsBlock(insights),
        trendsBlock,
      ].join("\n\n");

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL_SONNET,
        max_tokens: 1200,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: `Cliente: ${client.name}\n\n${context}` }],
      });
      await recordApiUsage({
        source: "cron:portal-opportunities",
        clientId: client.id,
        model: response.model,
        usage: response.usage,
      });

      const toolUse = response.content.find((b) => b.type === "tool_use");
      const opps = validate(toolUse && toolUse.type === "tool_use" ? toolUse.input : null);

      // La tanda nueva reemplaza a la anterior (lo descartado queda descartado).
      await supabase
        .from("portal_opportunities")
        .update({ status: "vencida" })
        .eq("client_id", client.id)
        .in("status", ["activa", "interna"]);

      if (opps.length === 0) {
        results.push({ client: client.id, status: "ok", count: 0 });
        continue;
      }

      const expires = new Date(Date.now() + 8 * 86400000).toISOString();
      const { error: insErr } = await supabase.from("portal_opportunities").insert(
        opps.map((o) => ({
          client_id: client.id,
          kind: o.kind,
          title: o.title,
          body: o.body,
          basis: o.basis,
          status: publish ? "activa" : "interna",
          expires_at: expires,
        })),
      );
      if (insErr) throw new Error(`insert: ${insErr.message}`);

      await supabase.from("notifications").insert({
        client: client.id,
        to_role: "team",
        agent: "portal-opportunities",
        level: "info",
        title: publish
          ? `El asesor le mostró ${opps.length} oportunidad${opps.length === 1 ? "" : "es"} a ${client.name}`
          : `El asesor detectó ${opps.length} oportunidad${opps.length === 1 ? "" : "es"} para ${client.name} (sin publicar)`,
        body: opps.map((o) => `• ${o.title}`).join("\n"),
        link: `/cliente/${client.id}`,
        read: false,
        email_sent: false,
      });

      results.push({ client: client.id, status: "ok", count: opps.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error(`[portal-opportunities] ${client.id}:`, message);
      results.push({ client: client.id, status: `error: ${message}` });
    }
  }

  return Response.json({
    ok: true,
    configured: true,
    published: publish,
    clients: results,
    failed: results.filter((r) => r.status.startsWith("error")).length,
  });
}
