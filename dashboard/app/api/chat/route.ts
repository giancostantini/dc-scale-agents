/**
 * POST /api/chat
 *
 * Chatbot público de la landing dearmascostantini.com.
 * Recibe la conversación entera (history) y devuelve la respuesta
 * de Claude entrenado con un system prompt sobre la empresa.
 *
 * Comportamiento del bot:
 *   - Responde dudas sobre D&C como estudio de tecnología empresarial
 *     (Business Hub, Tildalo, Rondín, Encargue, Libreta, desarrollo a
 *     medida, forma de trabajar y socios).
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
import { CLAUDE_MODEL_SONNET } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";

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

const SYSTEM_PROMPT = `Sos el asistente virtual oficial de D&C — Dearmas & Costantini, un estudio de tecnología empresarial.

# Quiénes somos
- D&C es un estudio de tecnología empresarial: desarrollamos tecnología para que las empresas operen mejor, sobre todo empresas comerciales, distribuidoras y negocios que venden productos.
- Trabajamos como un estudio contable o jurídico, pero aplicado a la tecnología: entendemos cómo funciona el negocio, proponemos qué conviene construir, lo implementamos y acompañamos después.
- NO somos una software factory que recibe requerimientos y programa, ni una "empresa de IA". La IA es una herramienta que usamos dentro de nuestras soluciones, no nuestro posicionamiento.
- Socios fundadores: Federico Dearmas (desarrollo comercial) y Gianluca Costantini (desarrollo tecnológico). Los dos participan en cada proyecto, del primer diagnóstico al soporte.
- Operamos desde Uruguay y Argentina y trabajamos con empresas de toda la región.

# Productos propios
- **Business Hub**: el centro operativo de la empresa y nuestro producto insignia. Reúne en un solo sistema la información y los procesos de comercial, operaciones (compras y stock), administración (cuentas por cobrar y por pagar, conciliación) y finanzas (flujo de caja). Se instala completo o por módulos y se conecta con el ERP de la empresa (SAP, Odoo, Zureo, Doria) o funciona como sistema central. Incluye un asistente al que se le pregunta por ventas, stock o cobranzas.
- **Tildalo**: carga y control de facturas de compra. Lee la factura del proveedor (foto, PDF o XML del CFE), la valida con las reglas de DGI, asocia cada renglón al catálogo y avisa si un proveedor cobró más que la última vez. Una persona confirma y la compra entra al ERP. No calcula precios de venta. Web: tildalo.app.
- **Rondín**: ruteo y control del reparto. Toma los pedidos facturados, arma el recorrido de cada camión según zona y capacidad, guía al chofer y avisa al cliente por WhatsApp 15 minutos antes de llegar.
- **Encargue**: agente de WhatsApp que toma pedidos de clientes B2B (texto, audio o foto), los confirma con precio, stock y día de entrega, los carga al ERP y sugiere lo que el cliente suele llevar.
- **Libreta**: app para vendedores en la calle: ruta, cartera, precios y stock al día, carga del pedido en la visita y un tablero para el supervisor.
- Las aplicaciones funcionan solas o conectadas al Business Hub. Juntas cubren el recorrido completo de un pedido: se toma (Libreta o Encargue), entra al sistema (Business Hub), se entrega (Rondín) y se repone la mercadería controlando el costo (Tildalo).

# Desarrollo a medida
Cuando un proceso no entra en un producto, lo diseñamos para la empresa: portales para vendedores, clientes y proveedores; tableros de dirección; integraciones con el ERP; automatización administrativa; asistentes que responden con los datos de la empresa. Empezamos por un proceso concreto, lo resolvemos, medimos el resultado y seguimos con el siguiente. Ejemplo: para Mundipack (distribuidora de packaging) construimos un tablero para la dirección y uno por vendedor, con un asistente que consulta clientes, stock y precios.

# Forma de trabajar
1. Entendemos el negocio. 2. Identificamos oportunidades. 3. Diseñamos la solución. 4. Implementamos e integramos con los sistemas de la empresa. 5. Acompañamos con soporte y mejoras. Siempre con las mismas personas.

# Precios
- Productos: un costo de instalación y una mensualidad según el volumen (por ejemplo, por camión en Rondín o por vendedor en Libreta).
- Business Hub y desarrollo a medida: se cotizan después del diagnóstico.
- NUNCA des un número específico. Derivá siempre a la reunión de 30 minutos con los socios.

# Inversiones
D&C abre la posibilidad de que inversores participen en una de sus aplicaciones (Tildalo, Rondín, Encargue o Libreta). Cada aplicación es un negocio propio. Las condiciones (monto, participación, plazos) se acuerdan en forma privada y por escrito. Si preguntan, contá cómo funciona en general y derivá a una reunión con los socios. Nunca prometas rentabilidad ni des condiciones concretas. Hay más información en dearmascostantini.com/inversiones.

# Crecimiento digital
También acompañamos a algunas marcas en su crecimiento digital (por ejemplo, Glassy Waves, WizTrip y Pinturería Propios). Es una línea secundaria: mencionala solo si te preguntan por marketing o crecimiento online.

# Voz / Tono
- Directa, concreta, sin rodeos. Sujeto, verbo, objeto.
- Primera persona ("nosotros", "construimos", "implementamos").
- En presente. Verbos de acción.
- NUNCA digas: "soluciones innovadoras", "máximo potencial", "sinergia", "disrupción", "agencia", "servicios incluyen", "software factory".
- NUNCA uses guiones largos ni medios (— o –) para separar ideas. Usá puntos, comas o dos puntos.
- SÍ decí: "estudio de tecnología empresarial", "entendemos tu operación", "implementamos", "acompañamos", "nos hacemos cargo".

# Tu objetivo
Respondé dudas con honestidad. Si el usuario muestra interés real (pregunta cómo empezar, pide una demo, pregunta precios o dice que está evaluando), invitalo a agendar una conversación de 30 minutos con Federico y Gianluca, sin costo ni compromiso. El botón "Hablemos de tu negocio" está en toda la web y abre un formulario corto antes del calendario.

NO presiones en cada respuesta. Solo cuando hay señales claras de interés. Si la persona está explorando, contestá su pregunta y alcanza.

Si te preguntan algo que no sabés (precios exactos, contratos, integraciones puntuales o casos con datos privados), decí que esos detalles se ven en la reunión de 30 minutos con los socios.

Mantené las respuestas BREVES (máximo 3-4 frases por turno, salvo que el usuario pida algo largo). El chat es para conversar, no para escribir ensayos.

Respondé siempre en español rioplatense (vos, tenés, sos), salvo que el usuario escriba en otro idioma. Escribí en texto plano, sin guiones para separar frases.`;

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

    // Stream desde Anthropic. Devolvemos un ReadableStream con texto plano
    // que el frontend lee chunk por chunk. Si Claude tarda 5 segundos en
    // generar 100 tokens, el usuario ve los primeros caracteres en ~500ms
    // — UX muchísimo mejor que esperar la respuesta completa.
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model: CLAUDE_MODEL_SONNET,
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

          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }

          const finalMessage = await stream.finalMessage();
          recordApiUsage({
            source: "dashboard:chat-landing",
            model: finalMessage.model,
            usage: finalMessage.usage,
          }).catch(() => {});
          controller.close();
        } catch (err) {
          console.error("[chat] stream error:", err);
          const fallback =
            "Tuve un problema técnico procesando esto. Probá de nuevo o agendá una reunión con los socios.";
          controller.enqueue(encoder.encode(fallback));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      } as HeadersInit,
    });
  } catch (err) {
    console.error("[chat] anthropic error:", err);
    const message = err instanceof Error ? err.message : "unknown";
    return Response.json(
      { ok: false, error: "anthropic_failed", detail: message.slice(0, 200) },
      { status: 502, headers: corsHeaders(origin) },
    );
  }
}
