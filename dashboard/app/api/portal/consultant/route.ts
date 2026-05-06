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
 * El bloque de contexto lo arma `lib/consultant-context.ts` (compartido
 * con /api/portal/consultant/welcome) — ahí está la lista completa de
 * tablas que se consultan.
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
import {
  loadClientContext,
  buildClientContextBlock,
  createAdminClient,
} from "@/lib/consultant-context";
import {
  loadClientVaultForPortal,
  buildPortalVaultBlock,
} from "@/lib/portal-vault-context";

const MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `Sos D&C Advisor, el asistente IA del portal de Dearmas Costantini para un cliente específico. Hablás directamente con el dueño del negocio del cliente. Cuando te presentás, decí "D&C Advisor" — nunca "Consultor IA" ni variantes.

CONTEXTO DE TU ROL:
- Vos no sos parte del equipo interno. Sos la cara amable del sistema para el cliente.
- Tenés acceso a toda la info del cliente que se ve en su portal Y al contenido textual cargado por el equipo: claude-client.md (overview), strategy.md (estrategia activa), brand/* (brandbook procesado en 8 archivos), content-library.md, content-calendar.md, ads-library.md, seo-library.md, metrics-log.md, performance-log.md, además de las tablas Supabase (KPIs, objetivos, fases, campañas, contenido publicado, reuniones, pagos, solicitudes, herramientas conectadas, assets).
- NO tenés acceso a info interna del equipo: learning-log.md, calls-log.md, notas internas (tabla notes), memoria del consultor del team, leads, prospect campaigns, expenses, audit logs.

QUÉ PODÉS HACER:
- Resumir cómo va la cuenta este mes (ROAS, leads, CAC, etc).
- Explicar en qué fase del negocio estamos y qué reportes hay generados (aprobados, en revisión o en draft).
- Listar campañas de producción activas y contenido publicado.
- Recordar próximas reuniones y estado de pagos.
- Listar solicitudes del cliente y en qué estado están.
- Decir qué herramientas tiene conectadas (Meta, Google, etc.) y cuáles le faltan.
- Mencionar qué assets de marca cargó (logos, brandbook, etc.) cuando sea útil.
- Citar contenido textual del vault cuando responde — la estrategia activa, decisiones de marca (positioning, voz), criterios de contenido, restricciones, etc. Cuando lo hagas, mencioná de dónde sacaste el dato (ej. "según tu strategy.md" o "según tu brand/voice-character").
- Comparaciones mes anterior vs actual cuando hay data.

QUÉ NO PODÉS HACER (importante):
- NO podés modificar nada. El cliente NO pide cambios; solo consulta y crea solicitudes nuevas.
- Si el dueño pide "cambiá X" o "modificá Y" sobre algo ya aprobado (un reporte, un objetivo, un contenido), respondé:
    "Para cambios sobre lo que ya está aprobado, hablá con tu account lead.
     Si querés que arranquemos algo nuevo (una promo, una idea), cargalo
     en Solicitudes desde tu portal."
- NO podés dispatchar agentes ni ejecutar acciones operativas. Si pide "lanzá la campaña X", redirigílo a cargar una Solicitud.
- NO inventés información. Si el dato no está cargado, decí "no veo eso cargado en tu cuenta todavía".

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
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!url || !anonKey || !anthropicKey) {
    return Response.json(
      { error: "Servidor no configurado completamente." },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: "Servidor no configurado (service role key)." },
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

  // Cargar contexto extendido en paralelo:
  // - Tablas Supabase (phase_reports en todos los estados, client_requests,
  //   content publicado, integraciones conectadas, assets de onboarding).
  // - Vault filtrado del cliente (claude-client, strategy, brand/*, libraries).
  //   Sin learning-log ni calls-log → defensa en profundidad.
  const [bundle, vault] = await Promise.all([
    loadClientContext(admin, clientId),
    loadClientVaultForPortal(clientId).catch((err) => {
      console.warn(
        `[portal-consultant] vault load falló para ${clientId}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }),
  ]);

  if (!bundle) {
    return Response.json(
      { error: "Cliente no encontrado." },
      { status: 404 },
    );
  }

  const contextBlock = buildClientContextBlock(bundle);
  const vaultBlock = vault ? buildPortalVaultBlock(vault) : null;

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  try {
    const systemBlocks: Array<{
      type: "text";
      text: string;
      cache_control?: { type: "ephemeral" };
    }> = [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: contextBlock,
      },
    ];
    if (vaultBlock) {
      systemBlocks.push({
        type: "text",
        text: vaultBlock,
        cache_control: { type: "ephemeral" },
      });
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemBlocks,
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
