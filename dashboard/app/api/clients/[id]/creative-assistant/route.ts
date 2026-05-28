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
   markdown con sugerencias concretas.

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
         "format": "reel" | "carrusel" | "post" | "story",
         "type": "valor" | "oferta" | "engagement",
         "idea": "Idea central de la pieza (1 frase)",
         "copy": "Copy completo listo para usar (con CTA si aplica)",
         "brief": "Brief breve para el editor: shots, tono, formato visual"
       }
     ]
   }

   Reglas estrictas para modo PROPOSE:
   - Respetá la frecuencia configurada del cliente (no propongas más
     piezas de las que pidió).
   - Respetá el mix valor/oferta/engagement del cliente para esa red.
   - Las fechas tienen que estar bien distribuidas según los días
     sugeridos (mié, mar/jue, etc según la frecuencia).
   - Cada copy tiene que estar listo para publicar — no "[acá poner X]".
   - Si te falta info crítica (sin estrategia aprobada, sin
     frecuencia), generá igual con supuestos razonables y aclaralo
     en el "intro".

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

  if (!url || !anonKey || !serviceKey || !anthropicKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  const { id: clientId } = await params;

  // Auth director
  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
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

  // Cargar contexto del cliente
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: client } = await admin
    .from("clients")
    .select(
      "id, name, sector, type, country, content_frequency, content_mix, onboarding",
    )
    .eq("id", clientId)
    .maybeSingle();
  if (!client) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
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

  // Construir bloque de contexto
  const contextBlock = `CLIENTE: ${client.name} · sector: ${client.sector} · tipo: ${client.type}
PAÍS: ${client.country ?? "no especificado"}

FRECUENCIA CONFIGURADA (por red × formato, x veces por semana):
${JSON.stringify(client.content_frequency ?? {}, null, 2)}

MIX DE TIPO DE CONTENIDO POR RED (% valor / oferta / engagement):
${JSON.stringify(client.content_mix ?? {}, null, 2)}

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

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL_OPUS,
      max_tokens: mode === "propose" ? 8000 : 2000,
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
        { type: "text", text: constraintsBlock },
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

    return Response.json({
      success: true,
      mode,
      reply,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (err) {
    console.error("[creative-assistant] Claude error:", err);
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
