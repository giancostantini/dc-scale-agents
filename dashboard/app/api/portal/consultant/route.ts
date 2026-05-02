/**
 * POST /api/portal/consultant
 *
 * Consultor IA para el cliente final (role='client'). Versión más
 * simple que el /api/consultant del equipo:
 *  - Sin tool calls (el cliente no puede dispatchar agentes)
 *  - Sin escritura de memoria
 *  - Contexto filtrado: solo info que el cliente puede ver
 *  - Tono explicativo, dirigido al dueño del negocio
 *  - Si pide cambios sobre cosas aprobadas, redirige al account lead
 *
 * Body:
 *   messages: [{ role: "user" | "assistant", content: string }]
 *
 * Response:
 *   { reply, usage, model }
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `Sos el Consultor IA del portal de Dearmas Costantini para un cliente específico. Hablás directamente con el dueño del negocio del cliente.

CONTEXTO DE TU ROL:
- Vos no sos parte del equipo interno. Sos la cara amable del sistema para el cliente.
- Tenés acceso solo a la info del propio cliente (sus KPIs, objetivos, reportes aprobados, contenido publicado, próximas reuniones, pagos).
- NO tenés acceso a info interna del equipo: pagos del team, notas internas, leads, prospect campaigns, expenses.

QUÉ PODÉS HACER:
- Resumir cómo va la cuenta este mes (ROAS, leads, CAC, etc).
- Explicar qué dice el último reporte aprobado.
- Listar campañas de producción activas.
- Mostrar qué contenido se publicó.
- Recordar próximas reuniones.
- Estado de pagos.
- Comparaciones mes anterior vs actual cuando hay data.

QUÉ NO PODÉS HACER (importante):
- NO podés modificar nada. El cliente NO pide cambios; solo consulta y crea solicitudes nuevas.
- Si el dueño pide "cambiá X" o "modificá Y" sobre algo ya aprobado (un reporte, un objetivo, un contenido), respondé:
    "Para cambios sobre lo que ya está aprobado, hablá con tu account lead.
     Si querés que arranquemos algo nuevo (una promo, una idea), cargalo
     en Solicitudes desde tu portal."
- NO podés dispatchar agentes ni ejecutar acciones operativas. Si pide "lanzá la campaña X", redirigílo a cargar una Solicitud.

VOZ DE MARCA D&C:
- Directa, sin jerga. Prohibido: "sinergia", "potenciar", "transformar", "valor agregado", "ecosistema".
- Concreto: números, fechas, hechos. Sin promesas vacías.
- Confianza humilde: explicás lo que pasa, no oversells.
- Español rioplatense (vos, tu empresa).
- Respuestas cortas (2-4 oraciones por defecto). Si pide explicación detallada, podés extenderte.

FORMATO:
- Markdown limpio cuando suma (tablas para comparaciones, bullets para listas).
- Si no tenés data para responder, decílo: "No veo eso en tu cuenta. Hablá con tu account lead."
- Nunca inventes números. Si la métrica no está cargada, decí que falta.`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!url || !anonKey || !serviceKey || !anthropicKey) {
    return Response.json(
      { error: "Servidor no configurado completamente." },
      { status: 500 },
    );
  }

  // Auth: el caller debe ser un cliente autenticado
  const callerToken = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role, client_id, name")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== "client" || !callerProfile.client_id) {
    return Response.json(
      {
        error:
          "Este consultor es solo para clientes finales. Si sos del equipo, usá el consultor desde la página del cliente.",
      },
      { status: 403 },
    );
  }

  const clientId = callerProfile.client_id;

  let body: { messages?: Message[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const { messages } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "Faltan messages[]" },
      { status: 400 },
    );
  }

  // Cargar contexto del cliente con service role (bypaseando RLS, pero
  // SOLO leemos info del client_id del caller, jamás de otros).
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [
    { data: client },
    { data: objectives },
    { data: phaseReports },
    { data: prodCampaigns },
    { data: events },
    { data: payments },
  ] = await Promise.all([
    admin
      .from("clients")
      .select("id, name, sector, type, phase, method, fee, kpis, modules")
      .eq("id", clientId)
      .maybeSingle(),
    admin
      .from("objectives")
      .select("period, period_type, items")
      .eq("client_id", clientId)
      .maybeSingle(),
    admin
      .from("phase_reports")
      .select("phase, status, content_md, approved_at")
      .eq("client_id", clientId)
      .eq("status", "approved"),
    admin
      .from("production_campaigns")
      .select("title, type, status, start_date, end_date")
      .eq("client_id", clientId),
    admin
      .from("cal_events")
      .select("title, date, time, type")
      .eq("client_id", clientId)
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date")
      .limit(5),
    admin
      .from("payments")
      .select("month, status, paid_date")
      .eq("client_id", clientId)
      .order("month", { ascending: false })
      .limit(6),
  ]);

  if (!client) {
    return Response.json(
      { error: "Cliente no encontrado." },
      { status: 404 },
    );
  }

  const contextBlock = buildClientContextBlock({
    client: client as ClientForContext,
    objectives: objectives as ObjectivesForContext | null,
    phaseReports: (phaseReports ?? []) as PhaseReportForContext[],
    prodCampaigns: (prodCampaigns ?? []) as ProdCampaignForContext[],
    events: (events ?? []) as EventForContext[],
    payments: (payments ?? []) as PaymentForContext[],
  });

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: contextBlock,
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const reply =
      textBlock && textBlock.type === "text"
        ? textBlock.text.trim()
        : "No tengo respuesta para eso ahora.";

    return Response.json({
      reply,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
      model: response.model,
    });
  } catch (err) {
    console.error("portal consultant error:", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY inválida." },
        { status: 401 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Rate limit. Esperá unos segundos." },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Claude: ${err.message}` },
        { status: err.status ?? 500 },
      );
    }
    return Response.json({ error: "Error inesperado" }, { status: 500 });
  }
}

// =================== Context builder ===================

interface ClientForContext {
  id: string;
  name: string;
  sector: string | null;
  type: string | null;
  phase: string | null;
  method: string | null;
  fee: number | string | null;
  kpis: Record<string, unknown> | null;
  modules: Record<string, boolean> | null;
}

interface ObjectivesForContext {
  period: string;
  period_type: string;
  items: { id: string; name: string; now: string; target: string; unit: string; pct: number }[];
}

interface PhaseReportForContext {
  phase: string;
  status: string;
  content_md: string | null;
  approved_at: string | null;
}

interface ProdCampaignForContext {
  title: string;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

interface EventForContext {
  title: string;
  date: string;
  time: string | null;
  type: string;
}

interface PaymentForContext {
  month: string;
  status: string;
  paid_date: string | null;
}

function buildClientContextBlock(args: {
  client: ClientForContext;
  objectives: ObjectivesForContext | null;
  phaseReports: PhaseReportForContext[];
  prodCampaigns: ProdCampaignForContext[];
  events: EventForContext[];
  payments: PaymentForContext[];
}): string {
  const { client, objectives, phaseReports, prodCampaigns, events, payments } = args;
  const lines: string[] = ["CONTEXTO DEL CLIENTE (datos reales — usá esto, no inventes):"];

  // Cliente
  lines.push("");
  lines.push("## Cliente");
  lines.push(`- Nombre: ${client.name}`);
  if (client.sector) lines.push(`- Sector: ${client.sector}`);
  if (client.method) lines.push(`- Método: ${client.method}`);
  if (client.phase) lines.push(`- Fase actual: ${client.phase}`);

  // KPIs
  if (client.kpis && Object.keys(client.kpis).length > 0) {
    lines.push("");
    lines.push("## KPIs del mes actual");
    for (const [k, v] of Object.entries(client.kpis)) {
      lines.push(`- ${k}: ${v ?? "—"}`);
    }
  }

  // Objetivos
  if (objectives && objectives.items?.length > 0) {
    lines.push("");
    lines.push(`## Objetivos · ${objectives.period}`);
    for (const o of objectives.items) {
      lines.push(`- ${o.name}: ${o.now}${o.unit} / ${o.target}${o.unit} (${o.pct}%)`);
    }
  }

  // Reportes aprobados (resumen ejecutivo)
  if (phaseReports.length > 0) {
    lines.push("");
    lines.push("## Reportes aprobados (resumen ejecutivo de cada uno)");
    for (const r of phaseReports) {
      lines.push("");
      lines.push(`### ${r.phase}`);
      const summary = extractSummary(r.content_md);
      lines.push(summary || "(sin resumen)");
    }
  }

  // Campañas activas
  if (prodCampaigns.length > 0) {
    lines.push("");
    lines.push("## Campañas de producción");
    for (const c of prodCampaigns) {
      const period = [c.start_date, c.end_date].filter(Boolean).join(" → ");
      lines.push(`- ${c.title} (${c.type}) · ${c.status}${period ? ` · ${period}` : ""}`);
    }
  }

  // Eventos próximos
  if (events.length > 0) {
    lines.push("");
    lines.push("## Próximas reuniones");
    for (const e of events) {
      lines.push(`- ${e.date}${e.time ? ` ${e.time}` : ""} · ${e.title} (${e.type})`);
    }
  }

  // Pagos
  if (payments.length > 0) {
    lines.push("");
    lines.push("## Estado de pagos (últimos 6 meses)");
    for (const p of payments) {
      lines.push(`- ${p.month}: ${p.status}${p.paid_date ? ` (pagado el ${p.paid_date.slice(0, 10)})` : ""}`);
    }
  }

  return lines.join("\n");
}

function extractSummary(markdown: string | null): string {
  if (!markdown) return "";
  const match = markdown.match(
    /##\s*Resumen ejecutivo\s*\n([\s\S]*?)(?=\n##\s+|$)/i,
  );
  if (match && match[1]) return match[1].trim();
  return markdown.trim().slice(0, 600);
}
