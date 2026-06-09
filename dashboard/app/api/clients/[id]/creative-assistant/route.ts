/**
 * POST /api/clients/[id]/creative-assistant
 *
 * Chat con el Asistente Creativo del cliente. Genera ideas de
 * contenido, copies, briefs, y propuestas de calendario basadas en
 * el contexto del cliente (estrategia, branding, frecuencia, mix).
 *
 * Modos:
 *   - "chat":    chat libre. Devuelve markdown.
 *   - "propose": propone N piezas de contenido como JSON estructurado
 *                para guardar como content_posts. El frontend muestra
 *                las propuestas con un botón "Aprobar y agregar al
 *                calendario" que las persiste.
 *
 * Body:
 *   mode: "chat" | "propose"
 *   messages: { role: "user" | "assistant"; content: string }[]
 *   constraints?: {
 *     count?: number      // cantidad de piezas a proponer (modo propose)
 *     startDate?: string  // YYYY-MM-DD desde cuándo empezar
 *     networks?: string[] // ["ig", "tt", "in", "fb", "yt"]
 *   }
 *
 * Solo director.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL_OPUS } from "@/lib/anthropic-model";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

interface Constraints {
  count?: number;
  startDate?: string;
  networks?: string[];
}

const SYSTEM_PROMPT = `Sos el Asistente Creativo de Dearmas Costantini para un cliente
específico. Tu rol: ayudar al equipo (director + equipo creativo) a
diseñar el contenido del cliente.

Conocés el contexto del cliente: sector, branding, estrategia
aprobada, frecuencia de contenido configurada (red × formato), y mix
porcentual entre tipos (valor / oferta / engagement).

VOZ DE D&C:
- Directa, no salesy. "No somos agencia, somos socios."
- Sin jerga consultora: prohibido "sinergia", "disrupción", "valor
  agregado", "transformar", "potenciar".
- Concreto sobre abstracto: ejemplos específicos, verbos de acción.
- Español rioplatense para clientes LATAM (vos, tu marca).

DOS MODOS:

1) CHAT — el usuario te pregunta algo abierto (ej "qué ideas tenés
   para mayo?", "ayudame con un copy para Reels"). Respondés en
   markdown con sugerencias concretas. SI el director está pidiendo
   piezas que claramente quiere que se agreguen a la tabla
   (ej "armame 10 piezas para junio"), respondés en markdown CON las
   ideas pero al final aclará: "Si querés que te las agregue directo
   a la tabla con idea + copy + CTA, apretá el botón ✨ Generar ideas
   para la tabla en vez de Solo chatear." Nunca digas "cambiá a modo
   PROPOSE" — el director no ve esa palabra en la UI.

2) PROPOSE — el usuario te pide N piezas para agregar al calendario.
   En este modo devolvés ÚNICAMENTE un objeto JSON sin code fences,
   con esta estructura:

   {
     "intro": "1-2 oraciones explicando la lógica del batch",
     "pieces": [
       {
         "date": "YYYY-MM-DD",
         "time": "HH:mm",
         "network": "ig" | "tt" | "in" | "fb",
         "format": "reel" | "carrusel" | "post" | "story" | "ugc" | "anuncio",
         "type": "valor" | "oferta" | "engagement",
         "idea": "Concepto creativo central de la pieza (1-2 frases).",
         "copy": "Texto completo listo para publicar — caption final con hooks, body y CTA inline si aplica.",
         "cta": "Solo si format=anuncio: 2-5 palabras tipo 'Reservá tu lugar', 'Comprá ahora', 'Agendá tu cita'. Si no es anuncio, omití este campo.",
         "brief": "Instrucciones para el editor/diseñador: shots, tono visual, formato técnico, referencias."
       }
     ]
   }

   Reglas estrictas para modo PROPOSE:
   - SIEMPRE devolvés idea + copy + brief — son los tres campos
     mínimos que llenan la tabla del cliente.
   - Si format = "anuncio", SIEMPRE incluí también el campo "cta"
     (corto, accionable, 2-5 palabras). No lo dejes vacío.
   - Respetá la frecuencia configurada del cliente (no propongas más
     piezas de las que pidió).
   - Respetá el mix valor/oferta/engagement del cliente para esa red.
   - Las fechas tienen que estar bien distribuidas según los días
     sugeridos (mié, mar/jue, etc según la frecuencia).
   - Cada copy tiene que estar listo para publicar — no "[acá poner X]".
   - El brief y la idea son DISTINTOS: idea = concepto creativo;
     brief = instrucciones operativas para producir la pieza.
   - Si te falta info crítica (sin estrategia aprobada, sin
     frecuencia), generá igual con supuestos razonables y aclaralo
     en el "intro".
   - LÍMITE TÉCNICO: nunca devuelvas más de 40 piezas en una sola
     llamada. Si el director pidió un rango que claramente excede 40
     (ej "todas las piezas de 2 meses con 4 redes"), generá las
     primeras 40 que cubran lo más urgente/temprano del rango, y en
     "intro" aclará explícitamente: "Te armé las primeras 40 piezas
     (hasta DD/MM). Cuando quieras el resto, pedime 'el siguiente
     batch desde DD/MM' y te armo el segundo lote."

NUNCA mezcles modos: si te dicen "modo PROPOSE", devolvés SOLO el
JSON. Si te dicen "modo CHAT", devolvés markdown.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anthropicKey) missing.push("ANTHROPIC_API_KEY");
  if (missing.length > 0) {
    return Response.json(
      {
        error: "Servidor no configurado.",
        detail: `Faltan estas env vars en producción: ${missing.join(", ")}`,
      },
      { status: 500 },
    );
  }

  const { id: clientId } = await params;

  // Auth director
  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const callerClient = createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { data: callerProfile, error: profErr } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (profErr) {
    return Response.json(
      {
        error: "No se pudo leer el perfil.",
        detail: profErr.message,
      },
      { status: 500 },
    );
  }
  if (!callerProfile) {
    return Response.json(
      {
        error: "Perfil no encontrado.",
        detail: `No hay row en profiles con id=${caller.id}. Verificá que el usuario tenga perfil cargado.`,
      },
      { status: 403 },
    );
  }
  if (callerProfile.role !== "director") {
    return Response.json(
      {
        error: "Solo directores.",
        detail: `Tu rol actual es '${callerProfile.role}'. Pedile a un director que te promueva o que use él el asistente.`,
      },
      { status: 403 },
    );
  }

  let body: {
    mode?: "chat" | "propose";
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
    constraints?: Constraints;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const mode = body.mode ?? "chat";
  const messages = body.messages ?? [];
  const constraints = body.constraints ?? {};
  if (messages.length === 0) {
    return Response.json({ error: "Sin mensajes" }, { status: 400 });
  }

  // Guardrail por batches gigantes: en propose con count > 40 el modelo
  // suele exceder el tiempo máximo de la función (Vercel Hobby = 60s) y
  // la respuesta termina siendo un timeout HTML que el frontend no
  // puede parsear. Mejor cortar acá con un error útil.
  if (mode === "propose" && constraints.count && constraints.count > 40) {
    return Response.json(
      {
        error: "Batch demasiado grande.",
        detail: `Pediste ${constraints.count} piezas en un solo batch. El asistente puede armar hasta ~40 por llamada sin riesgo de timeout. Probá partir el pedido por mes (ej "armame las piezas de julio" y después "las de agosto") o por red (ej "todas las piezas de IG de julio y agosto").`,
      },
      { status: 413 },
    );
  }

  // Cargar contexto del cliente — uso queries defensivas: si una
  // columna no existe (porque la migración no se aplicó), reintentamos
  // con SELECT * para no quedar bloqueados.
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let client: Record<string, unknown> | null = null;
  {
    const { data, error: cliErr } = await admin
      .from("clients")
      .select("id, name, sector, type, country, content_frequency, content_mix, onboarding")
      .eq("id", clientId)
      .maybeSingle();
    if (cliErr) {
      // Reintento con SELECT * por si alguna columna no existe
      const fallback = await admin
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .maybeSingle();
      if (fallback.error) {
        return Response.json(
          {
            error: "Error leyendo el cliente.",
            detail: `${cliErr.message} / fallback: ${fallback.error.message}`,
          },
          { status: 500 },
        );
      }
      client = fallback.data as Record<string, unknown>;
    } else {
      client = data as Record<string, unknown>;
    }
  }
  if (!client) {
    // Listar IDs disponibles para ayudar a diagnosticar el mismatch
    const { data: allClients } = await admin
      .from("clients")
      .select("id, name")
      .order("created_at", { ascending: false })
      .limit(10);
    const sample =
      allClients && allClients.length > 0
        ? allClients.map((c) => `${c.id} (${c.name})`).join(", ")
        : "no hay clientes cargados";
    return Response.json(
      {
        error: "Cliente no encontrado.",
        detail: `Estoy buscando id="${clientId}" pero no existe en clients. IDs disponibles (últimos 10): ${sample}`,
      },
      { status: 404 },
    );
  }

  // Estrategia aprobada (si existe)
  const { data: strategy } = await admin
    .from("phase_reports")
    .select("content_md, status")
    .eq("client_id", clientId)
    .eq("phase", "estrategia")
    .eq("status", "approved")
    .maybeSingle();

  // Posts existentes (últimos 30)
  const { data: existingPosts } = await admin
    .from("content_posts")
    .select("date, time, network, format, brief, status")
    .eq("client_id", clientId)
    .order("date", { ascending: false })
    .limit(30);

  // Construir bloque de contexto — todos los campos son opcionales por defensa
  const cName = String(client.name ?? "—");
  const cSector = String(client.sector ?? "—");
  const cType = String(client.type ?? "—");
  const cCountry = client.country ? String(client.country) : "no especificado";
  const cFreq = client.content_frequency ?? {};
  const cMix = client.content_mix ?? {};
  const contextBlock = `CLIENTE: ${cName} · sector: ${cSector} · tipo: ${cType}
PAÍS: ${cCountry}

FRECUENCIA CONFIGURADA (por red × formato, x veces por semana):
${JSON.stringify(cFreq, null, 2)}

MIX DE TIPO DE CONTENIDO POR RED (% valor / oferta / engagement):
${JSON.stringify(cMix, null, 2)}

ESTRATEGIA APROBADA:
${strategy?.content_md ? strategy.content_md.slice(0, 8000) : "No hay estrategia aprobada todavía. Trabajá con la frecuencia y mix configurados."}

POSTS EXISTENTES (últimos 30 — para no repetir):
${
  existingPosts && existingPosts.length > 0
    ? existingPosts
        .map((p) => `- ${p.date} ${p.time} · ${p.network} ${p.format} · ${p.brief?.slice(0, 80)}`)
        .join("\n")
    : "(sin posts cargados todavía)"
}`;

  const constraintsBlock = `INSTRUCCIONES DE ESTE TURNO:
Modo: ${mode.toUpperCase()}
${
  mode === "propose"
    ? `Cantidad de piezas a proponer: ${constraints.count ?? "según frecuencia semanal × 1 semana"}
Fecha desde la cual empezar: ${constraints.startDate ?? new Date().toISOString().slice(0, 10)}
Redes a incluir: ${constraints.networks?.join(", ") ?? "todas las activas en la frecuencia"}
RECORDÁ: devolvés SOLO el JSON con la estructura definida arriba. Sin code fences, sin preámbulo.`
    : "Respondé en markdown. Sugerencias concretas y aplicables."
}`;

  const anthropic = new Anthropic({ apiKey: anthropicKey! });

  // Tool schema para el modo PROPOSE — fuerza JSON estructurado en
  // lugar de confiar en que el modelo siga la instrucción de "devolvé
  // SOLO JSON". Con tool_use Anthropic garantiza el formato.
  const proposeTool = {
    name: "propose_content_pieces",
    description:
      "Propone N piezas de contenido listas para agregar al calendario del cliente. Cada pieza tiene fecha, red, formato, idea, copy y brief.",
    input_schema: {
      type: "object" as const,
      properties: {
        intro: {
          type: "string",
          description: "1-2 oraciones explicando la lógica del batch (qué semana cubre, qué priorizó, etc).",
        },
        pieces: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "YYYY-MM-DD" },
              time: { type: "string", description: "HH:mm (24h)" },
              network: {
                type: "string",
                enum: ["ig", "tt", "in", "fb", "yt"],
                description: "Red social (ig=Instagram, tt=TikTok, in=LinkedIn, fb=Facebook, yt=YouTube)",
              },
              format: {
                type: "string",
                enum: ["reel", "carrusel", "post", "story", "ugc", "anuncio"],
              },
              type: {
                type: "string",
                enum: ["valor", "oferta", "engagement"],
                description: "Tipo del contenido según el mix configurado del cliente.",
              },
              idea: {
                type: "string",
                description: "Concepto creativo central de la pieza (1-2 frases). DISTINTO del brief y del copy.",
              },
              copy: {
                type: "string",
                description: "Texto completo listo para publicar (caption con hooks, body y CTA inline si aplica). NO escribas '[acá poner X]'.",
              },
              cta: {
                type: "string",
                description: "OBLIGATORIO cuando format='anuncio'. 2-5 palabras tipo 'Reservá tu lugar', 'Comprá ahora'. Vacío para formatos orgánicos.",
              },
              brief: {
                type: "string",
                description: "Instrucciones operativas para el editor/diseñador: shots, tono visual, formato técnico, referencias.",
              },
            },
            required: ["date", "network", "format", "idea", "copy", "brief"],
          },
        },
      },
      required: ["intro", "pieces"],
    },
  };

  const baseRequest: Record<string, unknown> = {
    // 16000 en propose para soportar batches grandes (el director
    // puede pedir 40+ piezas con copy completo). 2000 en chat.
    max_tokens: mode === "propose" ? 16000 : 2000,
    system: [
      {
        type: "text" as const,
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const },
      },
      {
        type: "text" as const,
        text: contextBlock,
        cache_control: { type: "ephemeral" as const },
      },
      { type: "text" as const, text: constraintsBlock },
    ],
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  if (mode === "propose") {
    baseRequest.tools = [proposeTool];
    baseRequest.tool_choice = { type: "tool", name: proposeTool.name };
  }

  // Modelos a intentar en orden: la config del director primero, después
  // fallbacks razonables. Si Anthropic deprecó alguno, pasamos al
  // siguiente. Si todos fallan, devolvemos el error original al usuario.
  const modelChain = [
    CLAUDE_MODEL_OPUS,
    "claude-opus-4-5",
    "claude-sonnet-4-5",
  ];

  // Extrae el resultado del response y arma el payload de respuesta.
  // En modo "propose" busca el tool_use block; en "chat" busca texto.
  function buildResponsePayload(
    response: { content: Array<{ type: string; text?: string; input?: unknown }>; usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; } },
    modelUsed: string,
    note?: string,
  ): Record<string, unknown> {
    const textBlock = response.content.find((b) => b.type === "text");
    const reply = textBlock?.text ? textBlock.text.trim() : "";

    let proposed: unknown = null;
    let replyForFrontend = reply;
    if (mode === "propose") {
      // Buscar tool_use block
      const toolBlock = response.content.find((b) => b.type === "tool_use");
      if (toolBlock && toolBlock.input !== undefined) {
        proposed = toolBlock.input;
        // El frontend espera "reply" como string JSON (para parsear).
        // Lo mantenemos serializado por backward compat + agregamos
        // `proposed` ya parseado para uso directo.
        replyForFrontend = JSON.stringify(proposed);
      }
    }

    return {
      success: true,
      mode,
      model: modelUsed,
      reply: replyForFrontend,
      proposed,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
      ...(note ? { note } : {}),
    };
  }

  let lastErr: unknown = null;
  for (const model of modelChain) {
    try {
      // thinking + tool_use no son compatibles — si está en modo
      // propose, no usamos thinking adaptive
      const useThinking = mode !== "propose";
      const response = (await anthropic.messages.create({
        ...baseRequest,
        model,
        ...(useThinking ? { thinking: { type: "adaptive" } } : {}),
      } as Parameters<typeof anthropic.messages.create>[0])) as Anthropic.Messages.Message;
      return Response.json(buildResponsePayload(response as never, model));
    } catch (err) {
      lastErr = err;
      // Si fue 400 (modelo/feature inválido), retry sin thinking antes
      // de pasar al siguiente modelo
      if (err instanceof Anthropic.APIError && err.status === 400) {
        try {
          const response = (await anthropic.messages.create({
            ...baseRequest,
            model,
          } as Parameters<typeof anthropic.messages.create>[0])) as Anthropic.Messages.Message;
          return Response.json(
            buildResponsePayload(response as never, model, "Retry sin extended thinking."),
          );
        } catch (retryErr) {
          lastErr = retryErr;
        }
      }
      // Si no es 404 (modelo inexistente), no probamos los siguientes
      if (err instanceof Anthropic.APIError && err.status !== 404) {
        break;
      }
      console.error(`[creative-assistant] model ${model} fallo:`, err);
    }
  }

  // Todos los intentos fallaron — devolver el último error con detalle
  console.error("[creative-assistant] Final error:", lastErr);
  if (lastErr instanceof Anthropic.APIError) {
    return Response.json(
      {
        error: `Claude API · ${lastErr.status ?? "?"}`,
        detail: lastErr.message,
      },
      { status: lastErr.status ?? 500 },
    );
  }
  const e = lastErr as Error;
  return Response.json(
    { error: "Error inesperado.", detail: e?.message ?? String(lastErr) },
    { status: 500 },
  );
}
