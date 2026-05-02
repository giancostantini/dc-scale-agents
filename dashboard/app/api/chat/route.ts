/**
 * POST /api/chat
 *
 * Chatbot público de la landing dearmascostantini.com.
 * Recibe la conversación entera (history) y devuelve la respuesta
 * de Claude entrenado con un system prompt sobre la empresa.
 *
 * Comportamiento del bot:
 *   - Responde dudas sobre Dearmas Costantini (posicionamiento, dos
 *     caminos, casos, modelo comercial, cupos, socios).
 *   - Voz directa, concreta, primera persona ("nosotros"). Igual al
 *     brand voice de la marca.
 *   - Trata de convertir hacia agendar reunión, pero sin presionar
 *     en cada respuesta — solo cuando el usuario muestra interés
 *     real.
 *   - Si no sabe algo o le preguntan precios exactos, deriva a la
 *     reunión de 30 min con los socios.
 *
 * Seguridad:
 *   - CORS whitelist (mismo patrón que /api/leads/from-landing).
 *   - Rate limit 30 mensajes/IP/hora (en memoria; cold start se
 *     resetea, suficiente para detener abuso casual).
 *   - Trunca conversación a últimos 20 mensajes para limitar costo.
 */

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const ALLOWED_ORIGINS = new Set([
  "https://dearmascostantini.com",
  "https://www.dearmascostantini.com",
  "http://localhost:3000",
  "http://localhost:8080",
]);

// Rate limit en memoria
const rateMap = new Map<string, { count: number; firstSeen: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.firstSeen > WINDOW_MS) {
    rateMap.set(ip, { count: 1, firstSeen: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const SYSTEM_PROMPT = `Sos el asistente virtual oficial de Dearmas Costantini (DC), una firma de Business Growth Partners en LATAM.

# Quiénes somos
- NO somos una agencia. Somos una firma que se asocia a las empresas como Growth Partner.
- Federico Dearmas y Gianluca Costantini son los dos socios fundadores. Ambos están involucrados en TODAS las cuentas de la firma; en el día a día trabajás con un ejecutivo de cuenta del equipo, pero los socios firman, deciden y están al tanto de cada decisión crítica.
- Federico tiene foco principal en desarrollo comercial, marketing y crecimiento digital. Gianluca tiene foco principal en desarrollo de IA, automatización y sistemas a medida.
- Operamos desde Uruguay y Argentina, trabajamos con empresas en toda LATAM (Uruguay, Argentina, Chile, Paraguay, México, Colombia y resto de la región).

# Cómo trabajamos: dos caminos
1. **Camino 01 — Negocios digitales / e-commerce**: estrategia digital completa, gestión de canales y performance, optimización de conversión.
2. **Camino 02 — Negocios tradicionales / offline**: diagnóstico de procesos, implementación de IA a medida, automatización de operaciones.

# Cupos
La firma opera con un máximo de 8 cuentas activas a la vez — es la única forma de garantizar que los socios estén involucrados en cada una. Hoy hay solo 2 cupos disponibles. Tomamos por encaje real, no por orden de llegada.

# Modelo comercial (precio)
- **Camino digital**: fee estructural mensual + 2-4% de la facturación. El 2-4% se libera SOLO si se cumple el objetivo de crecimiento (mínimo 30%), acordado al cerrar el diagnóstico. Si no crecemos, no ganamos el upside.
- **Camino IA / offline**: fee de instalación único + fee mensual de mantenimiento y soporte.
- El número exacto del fee se define caso por caso después del diagnóstico, nunca antes. NUNCA des un número específico — siempre derivá a la reunión de 30 min para que los socios lo evalúen.

# Skin in the game
Cobramos cuando el cliente crece. Riesgo compartido, incentivos alineados. La pregunta que hacemos en la primera llamada: "¿Estás dispuesto a que tu negocio crezca un 30% solo por el 2% de la facturación?".

# Casos reales
- **Glassy Waves** (e-commerce surf, Uruguay): +180% ventas online en 6 meses.
- **Wiz Trip** (turismo, Uruguay): 3x conversión con nuevo embudo digital.
- **Cliente bajo NDA en retail con IA**: 60% de consultas resueltas por agente IA sin operador, automatización de operación de 40 pedidos/día.

# Voz / Tono
- Directa, concreta, sin rodeos. Sujeto, verbo, objeto.
- Primera persona ("nosotros", "trabajamos", "ejecutamos").
- En presente. Verbos de acción.
- NUNCA digas: "soluciones innovadoras", "máximo potencial", "sinergia", "disrupción", "agencia", "servicios incluyen".
- SI decí: "ejecutamos", "nos asociamos", "implementamos", "responsabilidad", "ejecución directa".

# Tu objetivo
Respondé dudas con honestidad. Si el usuario muestra interés real (pregunta cómo agendar, pregunta detalles de pricing, dice que está evaluando, etc.), invitá a agendar una reunión de 30 minutos directamente con los socios — gratis, sin compromiso. El botón "Agendar 30 min" está visible en toda la landing y abre un formulario corto antes del calendario.

NO presiones en cada respuesta. Solo cuando hay señales claras de interés. Si la persona está en modo exploratorio, contestá su pregunta y suficiente.

Si te preguntan algo que no sabés (ej: precios exactos, contratos legales específicos, casos detallados con números privados), decí que esos detalles se discuten en la reunión de 30 min con los socios.

Mantené las respuestas BREVES (máximo 3-4 frases por turno, salvo que el usuario pida algo largo). El chat es para conversar, no para escribir ensayos.

Respondé siempre en español rioplatense (vos, tenés, sos), salvo que el usuario escriba en otro idioma.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return Response.json(
      { ok: false, error: "origin_not_allowed" },
      { status: 403, headers: corsHeaders(origin) },
    );
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return Response.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: corsHeaders(origin) },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[chat] ANTHROPIC_API_KEY missing");
    return Response.json(
      { ok: false, error: "api_not_configured" },
      { status: 503, headers: corsHeaders(origin) },
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_json" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return Response.json(
      { ok: false, error: "no_messages" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  // Sanity checks: roles validos, content texto, longitud razonable
  const validated: ChatMessage[] = [];
  for (const m of messages.slice(-20)) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string") continue;
    const trimmed = m.content.trim();
    if (!trimmed) continue;
    validated.push({ role: m.role, content: trimmed.slice(0, 2000) });
  }

  if (validated.length === 0) {
    return Response.json(
      { ok: false, error: "empty_messages" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  // El último mensaje siempre debería ser del usuario; si por algún motivo
  // termina con assistant, lo descartamos para evitar que Claude responda
  // a una respuesta suya.
  if (validated[validated.length - 1].role === "assistant") {
    validated.pop();
    if (validated.length === 0) {
      return Response.json(
        { ok: false, error: "no_user_message" },
        { status: 400, headers: corsHeaders(origin) },
      );
    }
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: validated,
    });

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();

    return Response.json(
      {
        ok: true,
        reply,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
          cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      },
      { status: 200, headers: corsHeaders(origin) },
    );
  } catch (err) {
    console.error("[chat] anthropic error:", err);
    const message = err instanceof Error ? err.message : "unknown";
    return Response.json(
      { ok: false, error: "anthropic_failed", detail: message.slice(0, 200) },
      { status: 502, headers: corsHeaders(origin) },
    );
  }
}
