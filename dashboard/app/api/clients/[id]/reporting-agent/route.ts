/**
 * POST /api/clients/[id]/reporting-agent
 *
 * Genera reportes ad-hoc de un cliente basados en el prompt del
 * director. Contexto: KPIs, content posts, pagos, fases aprobadas,
 * solicitudes recientes.
 *
 * El output es markdown que el frontend puede:
 *   - Mostrar inline
 *   - Copiar al portapapeles
 *   - Enviar por mail (endpoint separado)
 *
 * Body:
 *   messages: { role: "user" | "assistant"; content: string }[]
 *
 * Solo director.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL_OPUS } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Sos el Agente de Reporting de Dearmas Costantini para un cliente
específico. Tu rol: generar reportes ejecutivos en markdown que el
director puede enviar al cliente por mail.

Conocés todo el contexto del cliente: KPIs actuales y de últimos
meses, contenido publicado/programado, estado de fases del
onboarding, solicitudes pendientes, métricas de pauta, ingresos
cobrados, expensas asociadas.

VOZ DE D&C:
- Directa, no salesy. Sin jerga consultora.
- Concreto sobre abstracto: números, ejemplos específicos.
- Tono profesional pero cercano (rioplatense). "Vos" no "usted".
- Honesto: si algo va mal, decírlo. Si algo va bien, también.

FORMATO DE OUTPUT:
- Markdown limpio, listo para pegar en mail HTML.
- Empezá con un saludo simple ("Hola {cliente}").
- Estructura sugerida (el director puede pedir otra):
  1. Resumen ejecutivo (2-3 oraciones)
  2. KPIs / números clave
  3. Lo que pasó este período (logros, contenido publicado, campañas)
  4. Lo que viene (próximos hitos, decisiones pendientes)
  5. Cierre con CTA o pregunta abierta

REGLAS:
- Si el director te pide un reporte específico (ej "reporte mensual
  de mayo", "informe de pauta de la última campaña"), seguí ese
  scope estrictamente.
- NUNCA inventes números. Si no tenés el dato, escribí
  "⚠ Falta info" o sugerí al director qué consultar.
- Si el reporte es para enviar al cliente, evitá info interna
  (egresos, costos del equipo, dividendos). Solo lo que el cliente
  necesita ver.
- Si el director te pide un reporte interno (ej "para enviar a
  Federico/Gianluca"), ahí sí podés incluir métricas internas.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!url || !anonKey || !serviceKey || !anthropicKey) {
    return Response.json({ error: "Servidor no configurado." }, { status: 500 });
  }
  const { id: clientId } = await params;

  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) return Response.json({ error: "Sin sesión" }, { status: 401 });
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json({ error: "Solo directores." }, { status: 403 });
  }

  let body: {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const messages = body.messages ?? [];
  if (messages.length === 0) {
    return Response.json({ error: "Sin mensajes" }, { status: 400 });
  }

  // Cargar TODO el contexto del cliente
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: client } = await admin
    .from("clients")
    .select("id, name, sector, type, kpis, fee, country, contact_name, contact_email")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // En paralelo: fases, content, payments, requests, objectives
  const [phases, posts, payments, requests, objectives] = await Promise.all([
    admin
      .from("phase_reports")
      .select("phase, status, version, approved_at")
      .eq("client_id", clientId),
    admin
      .from("content_posts")
      .select("date, time, network, format, brief, status")
      .eq("client_id", clientId)
      .order("date", { ascending: false })
      .limit(40),
    admin
      .from("payments")
      .select("month, status, amount_override")
      .eq("client_id", clientId)
      .order("month", { ascending: false })
      .limit(12),
    admin
      .from("client_requests")
      .select("title, status, priority, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("objectives")
      .select("period, items")
      .eq("client_id", clientId)
      .maybeSingle(),
  ]);

  const contextBlock = `CLIENTE: ${client.name} · ${client.sector} · ${client.type === "gp" ? "Growth Partner" : "Desarrollo"}
PAÍS: ${client.country ?? "—"}
CONTACTO: ${client.contact_name ?? "—"} (${client.contact_email ?? "—"})
FEE MENSUAL: US$ ${client.fee}

KPIs ACTUALES:
${JSON.stringify(client.kpis ?? {}, null, 2)}

FASES DEL ONBOARDING:
${phases.data?.map((p) => `- ${p.phase}: ${p.status} (v${p.version}${p.approved_at ? ` aprobada ${p.approved_at.slice(0, 10)}` : ""})`).join("\n") ?? "(ninguna)"}

OBJETIVOS DEL PERÍODO:
${
  objectives.data
    ? `Período: ${objectives.data.period}
Items: ${JSON.stringify(objectives.data.items, null, 2).slice(0, 1000)}`
    : "(no hay objetivos seteados)"
}

CONTENIDO PUBLICADO/PROGRAMADO (últimos 40):
${
  posts.data && posts.data.length > 0
    ? posts.data
        .map((p) => `- ${p.date} ${p.time} · ${p.network} ${p.format} · ${p.status} · ${p.brief?.slice(0, 60)}`)
        .join("\n")
    : "(sin contenido cargado)"
}

PAGOS ÚLTIMOS 12 MESES:
${
  payments.data && payments.data.length > 0
    ? payments.data.map((p) => `- ${p.month}: ${p.status}${p.amount_override ? ` (override: US$${p.amount_override})` : ""}`).join("\n")
    : "(sin pagos registrados)"
}

SOLICITUDES RECIENTES DEL CLIENTE:
${
  requests.data && requests.data.length > 0
    ? requests.data.map((r) => `- ${r.title} [${r.status}, ${r.priority}] · ${r.created_at?.slice(0, 10)}`).join("\n")
    : "(sin solicitudes pendientes)"
}`;

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL_OPUS,
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: contextBlock,
          cache_control: { type: "ephemeral" },
        },
      ],
      thinking: { type: "adaptive" },
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const reply =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    await recordApiUsage({
      source: "dashboard:reporting-agent",
      clientId,
      model: response.model,
      usage: response.usage,
    });

    return Response.json({
      success: true,
      reply,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    });
  } catch (err) {
    console.error("[reporting-agent] Claude error:", err);
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        {
          error: `Claude API · ${err.status ?? "?"}`,
          detail: err.message,
        },
        { status: err.status ?? 500 },
      );
    }
    const e = err as Error;
    return Response.json(
      { error: "Error inesperado.", detail: e.message },
      { status: 500 },
    );
  }
}
