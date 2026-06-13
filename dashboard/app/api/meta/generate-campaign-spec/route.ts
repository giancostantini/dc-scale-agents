/**
 * POST /api/meta/generate-campaign-spec
 *
 * Toma un prompt natural + contexto del cliente + creativos subidos +
 * budget/fechas, y devuelve una CampaignSpec estructurada lista para
 * pushear a la Meta Marketing API (campaign → adset → ads).
 *
 * El procesamiento se hace con Claude (Anthropic). Devuelve JSON sin
 * code fences. El frontend muestra el spec en preview antes de
 * confirmarlo y pushearlo.
 *
 * Body:
 *   client_id: string
 *   prompt: string                          // qué quiere el director
 *   creatives: {
 *     url: string;   // URL pública (bucket content-post-previews)
 *     type: "image" | "video";
 *     description?: string;  // contexto opcional sobre el creativo
 *   }[]
 *   budget: {
 *     amount: number;                       // USD por día o total
 *     mode: "daily" | "lifetime";
 *     currency?: string;                    // default "USD"
 *   }
 *   schedule: {
 *     start_date: string;  // YYYY-MM-DD
 *     end_date?: string;
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

interface Creative {
  url: string;
  type: "image" | "video";
  description?: string;
}

interface CampaignBudget {
  amount: number;
  mode: "daily" | "lifetime";
  currency?: string;
}

interface CampaignSchedule {
  start_date: string;
  end_date?: string;
}

const SYSTEM_PROMPT = `Sos un Media Buyer experto de Dearmas Costantini. Tu trabajo: tomar
inputs del director sobre una campaña de Meta Ads (Facebook + Instagram)
y devolver un spec estructurado que se pueda pushear directo a la Meta
Marketing API.

Conocés:
- Objetivos de Meta y cuándo usar cada uno (TRAFFIC, CONVERSIONS,
  REACH, MESSAGES, LEAD_GENERATION, OUTCOME_AWARENESS, OUTCOME_TRAFFIC,
  OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_APP_PROMOTION,
  OUTCOME_SALES). Para Meta API v21+, preferí OUTCOME_*.
- Estructura targeting: geo (country/region/city), age (18-65),
  gender (1=male, 2=female, omit = todos), interests (Meta interest
  IDs), custom audiences.
- Optimization goals + billing events compatibles.
- Buenas prácticas de copy para FB/IG: headline corto (≤40 char), primary
  text persuasivo (≤125 char), CTA matching del objective.

ENTRADA QUE RECIBÍS:
- Prompt natural del director: qué quiere lograr.
- Lista de creativos (URLs públicos a imágenes o videos + descripción).
- Budget (daily o lifetime, monto en USD).
- Schedule (start_date, end_date opcional).
- Cliente (nombre + sector + bio si la hay).

SALIDA:
Devolvé ÚNICAMENTE un objeto JSON con esta forma exacta, sin code
fences ni texto explicativo alrededor:

{
  "campaign": {
    "name": "Nombre descriptivo · YYYY-MM",
    "objective": "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS" | "OUTCOME_ENGAGEMENT" | "OUTCOME_LEADS" | "OUTCOME_SALES",
    "special_ad_categories": [],
    "status": "PAUSED",
    "buying_type": "AUCTION"
  },
  "adset": {
    "name": "Nombre AdSet",
    "billing_event": "IMPRESSIONS" | "LINK_CLICKS",
    "optimization_goal": "REACH" | "LINK_CLICKS" | "CONVERSIONS" | "LEAD_GENERATION" | "OFFSITE_CONVERSIONS",
    "daily_budget": 5000,    // en centavos USD si mode='daily', null si mode='lifetime'
    "lifetime_budget": null, // en centavos USD si mode='lifetime', null si mode='daily'
    "start_time": "ISO 8601",
    "end_time": "ISO 8601 o null",
    "targeting": {
      "geo_locations": {
        "countries": ["AR", "UY"]
      },
      "age_min": 18,
      "age_max": 55,
      "genders": [],
      "publisher_platforms": ["facebook", "instagram"],
      "facebook_positions": ["feed", "story", "video_feeds"],
      "instagram_positions": ["stream", "story", "reels"],
      "device_platforms": ["mobile", "desktop"]
    },
    "status": "PAUSED"
  },
  "ads": [
    {
      "name": "Nombre Ad variation 1",
      "creative_ref": "<creative_url_aqui>",
      "creative_type": "image" | "video",
      "headline": "Headline ≤40 char",
      "primary_text": "Primary text persuasivo ≤125 char",
      "description": "Descripción opcional ≤30 char (solo carrusel/feed)",
      "cta_type": "LEARN_MORE" | "SHOP_NOW" | "SIGN_UP" | "BOOK_NOW" | "CONTACT_US" | "MESSAGE_PAGE" | "DOWNLOAD",
      "destination_url": "https://...",
      "status": "PAUSED"
    }
    // 1 ad por cada creativo recibido; si hay muchos, generá variaciones
    // de copy distintas para cada uno.
  ],
  "reasoning": "1-2 oraciones explicando por qué elegiste este
                objective y targeting para este caso."
}

IMPORTANTE:
- Los montos van en CENTAVOS (USD * 100). $50 USD = 5000.
- Todos los status arrancan en PAUSED — el director los activa
  manualmente en Ads Manager después de revisar.
- Si el prompt no aclara el geo, usá ["AR", "UY"] como default LATAM.
- Si el prompt no aclara edad/género, usá 18-55 sin restricción de género.
- Si el prompt no aclara destination_url, usá el sitio web del cliente
  o "https://example.com" como placeholder.
- destination_url tiene que estar en cada ad — el frontend después la
  reemplaza si hace falta.

NO incluyas comentarios, markdown ni texto fuera del JSON. Solo el
objeto JSON parseable.`;

interface RequestBody {
  client_id: string;
  prompt: string;
  creatives: Creative[];
  budget: CampaignBudget;
  schedule: CampaignSchedule;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY no configurada en el servidor." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json(
      { error: "Body inválido (esperaba JSON)" },
      { status: 400 },
    );
  }

  if (!body.client_id || !body.prompt?.trim()) {
    return Response.json(
      { error: "client_id y prompt son requeridos" },
      { status: 400 },
    );
  }

  // Auth + role check vía Supabase. Solo director puede generar specs.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "Faltan env vars de Supabase" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return Response.json({ error: "Sin auth" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userRes } = await admin.auth.getUser(token);
  if (!userRes.user) {
    return Response.json({ error: "Token inválido" }, { status: 401 });
  }

  // Verificar role=director.
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .single();
  if (profile?.role !== "director") {
    return Response.json(
      { error: "Solo director puede generar campañas Meta" },
      { status: 403 },
    );
  }

  // Cargar contexto del cliente (nombre, sector, website, bio si hay).
  const { data: client } = await admin
    .from("clients")
    .select("name, sector, website_url, social_profiles, external_links")
    .eq("id", body.client_id)
    .single();

  if (!client) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const clientBio =
    (client.social_profiles as { ig?: { bio?: string } } | null)?.ig?.bio ??
    "(sin bio cargada)";
  const destinationUrlDefault = client.website_url ?? "https://example.com";

  const userPrompt = `CLIENTE: ${client.name}
Sector: ${client.sector ?? "N/A"}
Sitio web: ${destinationUrlDefault}
Bio del perfil: ${clientBio}

PROMPT DEL DIRECTOR:
${body.prompt}

CREATIVOS SUBIDOS (${body.creatives.length}):
${body.creatives
  .map(
    (c, i) =>
      `${i + 1}. [${c.type}] ${c.url}${c.description ? ` — ${c.description}` : ""}`,
  )
  .join("\n")}

BUDGET:
${body.budget.mode === "daily" ? "Diario" : "Total (lifetime)"}: $${body.budget.amount} ${body.budget.currency ?? "USD"}

SCHEDULE:
Inicio: ${body.schedule.start_date}
${body.schedule.end_date ? `Fin: ${body.schedule.end_date}` : "Sin fecha de fin (corre indefinido)"}

Generá el spec JSON.`;

  const anthropic = new Anthropic({ apiKey });

  try {
    const completion = await anthropic.messages.create({
      model: CLAUDE_MODEL_OPUS,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = completion.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json(
        { error: "Claude no devolvió texto" },
        { status: 500 },
      );
    }

    // Sanitizar code fences si Claude los puso por error.
    const raw = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let spec: unknown;
    try {
      spec = JSON.parse(raw);
    } catch {
      return Response.json(
        {
          error: "El spec devuelto por Claude no es JSON parseable",
          detail: raw.slice(0, 500),
        },
        { status: 500 },
      );
    }

    return Response.json({ spec });
  } catch (e) {
    const err = e as Error;
    return Response.json(
      { error: "Error llamando a Claude", detail: err.message },
      { status: 500 },
    );
  }
}
