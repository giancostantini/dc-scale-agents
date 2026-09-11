// ==================== REDACCIÓN DE OUTREACH — SERVER ONLY ====================
// La voz de marca y el armado del prompt viven acá porque los consumen dos
// caminos: el preview interactivo (/api/generate-message) y el cron que
// llena la cola de aprobación (/api/cron/outreach-draft).
//
// Modelo: Sonnet. Antes esto corría en Opus con thinking adaptativo para
// producir ~60 palabras sobre-constrainadas — se pagaba razonamiento para
// escribir un párrafo. El system prompt va cacheado: el cron genera N
// mensajes seguidos y a partir del segundo lee del cache.
//
// Regla dura: esto REDACTA. No envía. El envío es siempre humano.

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL_SONNET } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";

export type OutreachChannel = "linkedin" | "email";

export interface OutreachCampaign {
  name?: string;
  countries: string[];
  regions?: string[];
  cities?: string[];
  industries: string[];
  companySizeMin?: number;
  companySizeMax?: number;
  revenueRange?: string;
  buyingSignals?: string[];
  roles: string[];
  seniorities: string[];
  cta: "calendly" | "landing" | "custom";
  ctaUrl?: string;
  messageTone?: string;
  valueAngle?: string;
}

export interface OutreachLead {
  name: string;
  company: string;
  role?: string;
  sector?: string;
  linkedin?: string;
  email?: string;
  notes?: string;
  /** URL del aviso que originó el prospecto — el gancho más específico. */
  sourceUrl?: string;
  /**
   * Qué le vendemos: growth (marketing) o dev (automatización e IA). El
   * ángulo del mensaje cambia por completo — y el de dev tiene una regla
   * de tono propia (ver SYSTEM_PROMPT).
   */
  vertical?: "growth" | "dev";
}

export interface OutreachResult {
  message: string;
  subject?: string;
  model: string;
  usage: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
}

// System prompt: voz de marca D&C — estable, se cachea.
const SYSTEM_PROMPT = `You are the prospection agent for Dearmas & Costantini (D&C), a Business Growth Partners firm operating in LATAM and Spain.

D&C's brand voice:
- Direct, not salesy — "no somos agencia, somos socios"
- Skin in the game: fee base + variable atado a resultados reales del cliente
- No corporate jargon, no clichés (evita: "sinergia", "disrupción", "valor agregado", "transformar", "potenciar")
- Concrete over abstract: números, casos específicos, verbos de acción
- Rioplatense Spanish for LATAM prospects (voseo: "tu empresa", "vos"), clean English for US/EU
- Humble confidence: observaciones y curiosidad, nunca promesas vacías

Two service lines:
1. Growth Partner — marketing digital con skin in the game (ads, contenido, SEO, analytics, CRO)
2. Desarrollo — IA/automatización aplicada a operaciones offline

OUTBOUND RULES (non-negotiable):
- Reference something SPECIFIC about the prospect: their company, role, industry signal, something observable from their LinkedIn or site
- If the prospect was found because they published a JOB POSTING, that is the strongest hook: acknowledge it naturally (they are hiring for X) and frame the offer as an alternative or a complement — never in a way that sounds like surveillance or mocks their hiring process

WHICH SERVICE LINE TO PITCH (the brief says which):
- vertical "growth" → marketing: they are hiring for an in-house marketing role, and the agency can do that work with skin in the game.
- vertical "dev" → automation / applied AI: they are hiring for a tech or data role, or the posting describes a repetitive manual process (spreadsheets, manual data entry, invoicing, reconciliation, stock control, order or customer follow-up over WhatsApp). If the brief names that specific process, reference IT — it is the most concrete thing you can say.

HARD RULE FOR THE "dev" VERTICAL (non-negotiable):
- The angle is ADDITIVE, never replacement. Do NOT suggest they skip the hire, cut the role, or "save on headcount". Never imply someone's job is unnecessary.
- The correct framing: a system absorbs the repetitive part of the process so the person they are hiring does the work that actually matters. Curiosity about how they handle that process today beats any claim about savings.
- A message that reads as "fire people / don't hire" destroys the brand in a small market. If in doubt, ask about the process instead of proposing anything.
- Avoid generic openers: "hope this finds you well", "quick question", "I'd love to connect", "saw your profile"
- No big promises, no bullet-list pitches, no "free consultation" language
- Soft, curious tone — the goal is to open a conversation, not close a deal in the first message

LINKEDIN FIRST-TOUCH:
- Max 300 characters
- Conversational, 2-3 sentences
- Ends with a soft question OR a mention of the CTA (Calendly/landing), not both
- No emojis

EMAIL COLD OUTBOUND:
- Subject line: max 6 words, lowercase OK, no salesy phrasing
- Body: max 120 words, 2-3 short paragraphs
- Open with a specific observation about their business/role
- Middle: the angle (why this is relevant to them specifically)
- Close: one clear CTA — either Calendly link or landing URL, never both
- No signature needed (will be appended separately)

OUTPUT FORMAT:
- For LinkedIn: return ONLY the message body, nothing else
- For Email: return in this exact format:
  Subject: [subject line]

  [body]
- Never include commentary, explanations, or meta-notes. Just the message.`;

/**
 * Los canales de la campaña se guardan como strings de display
 * ("LinkedIn", "Email", "Cold call"). La cola usa slugs. "Cold call" no
 * tiene automatización — se descarta acá para no generar drafts fantasma.
 */
export function normalizeChannels(raw: unknown): OutreachChannel[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<OutreachChannel>();
  for (const c of raw) {
    const v = String(c ?? "").trim().toLowerCase();
    if (v === "linkedin") out.add("linkedin");
    if (v === "email" || v === "mail") out.add("email");
  }
  return [...out];
}

function buildUserPrompt(
  campaign: OutreachCampaign,
  lead: OutreachLead,
  channel: OutreachChannel,
): string {
  const lines: string[] = [];

  lines.push("CAMPAIGN ICP:");
  if (campaign.countries.length) lines.push(`- Countries: ${campaign.countries.join(", ")}`);
  if (campaign.regions?.length) lines.push(`- Regions: ${campaign.regions.join(", ")}`);
  if (campaign.cities?.length) lines.push(`- Cities: ${campaign.cities.join(", ")}`);
  if (campaign.industries.length) lines.push(`- Industries: ${campaign.industries.join(", ")}`);
  if (campaign.companySizeMin && campaign.companySizeMax) {
    lines.push(`- Company size: ${campaign.companySizeMin}-${campaign.companySizeMax} employees`);
  }
  if (campaign.revenueRange) lines.push(`- Revenue: ${campaign.revenueRange}`);
  if (campaign.roles.length) lines.push(`- Target roles: ${campaign.roles.join(", ")}`);
  if (campaign.seniorities.length) lines.push(`- Seniority: ${campaign.seniorities.join(", ")}`);
  if (campaign.buyingSignals?.length) {
    lines.push(`- Buying signals to reference if relevant: ${campaign.buyingSignals.join(", ")}`);
  }

  lines.push("");
  lines.push("MESSAGING STRATEGY:");
  lines.push(`- Tone: ${campaign.messageTone || "Directo, cercano, sin jerga"}`);
  if (campaign.valueAngle) lines.push(`- Value angle: ${campaign.valueAngle}`);

  const ctaText =
    campaign.cta === "calendly"
      ? `Invite them to book a 30-min call. Calendly URL: ${campaign.ctaUrl || "(URL not set)"}`
      : campaign.cta === "landing"
        ? `Point them to the landing page for more info. URL: ${campaign.ctaUrl || "(URL not set)"}`
        : `Custom action: ${campaign.ctaUrl || "(specify the desired action)"}`;
  lines.push(`- CTA: ${ctaText}`);

  lines.push("");
  lines.push("SPECIFIC PROSPECT:");
  lines.push(
    `- Service line to pitch (vertical): ${lead.vertical === "dev" ? "dev — automation / applied AI (remember the ADDITIVE hard rule)" : "growth — marketing"}`,
  );
  lines.push(`- Name: ${lead.name}`);
  lines.push(`- Company: ${lead.company}`);
  if (lead.role) lines.push(`- Role: ${lead.role}`);
  if (lead.sector) lines.push(`- Sector: ${lead.sector}`);
  if (lead.linkedin) lines.push(`- LinkedIn URL: ${lead.linkedin}`);
  if (lead.email) lines.push(`- Email: ${lead.email}`);
  if (lead.sourceUrl) {
    lines.push(`- Signal that surfaced this prospect (job posting or similar): ${lead.sourceUrl}`);
  }
  if (lead.notes) lines.push(`- Notes about this lead: ${lead.notes}`);

  lines.push("");
  lines.push(
    channel === "linkedin"
      ? "Write a LinkedIn FIRST-TOUCH message to this prospect. Follow the LinkedIn rules strictly. Return ONLY the message body."
      : "Write a COLD EMAIL first-touch to this prospect. Follow the Email rules strictly. Return in the format 'Subject: ...\\n\\n[body]'.",
  );

  return lines.join("\n");
}

/**
 * Redacta un mensaje de primer contacto. Lanza si falta la API key o si
 * Claude falla — el caller decide si es fatal.
 */
export async function generateOutreachMessage({
  campaign,
  lead,
  channel,
  model = CLAUDE_MODEL_SONNET,
  usageSource = "dashboard:generate-message",
}: {
  campaign: OutreachCampaign;
  lead: OutreachLead;
  channel: OutreachChannel;
  model?: string;
  usageSource?: string;
}): Promise<OutreachResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY no configurada. Agregala a .env.local (local) o a Vercel env vars (producción).",
    );
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserPrompt(campaign, lead, channel) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Respuesta de Claude sin texto");
  }

  const rawText = textBlock.text.trim();
  let subject: string | undefined;
  let messageBody = rawText;
  if (channel === "email") {
    const match = rawText.match(/^Subject:\s*(.+?)\n\s*\n([\s\S]+)$/i);
    if (match) {
      subject = match[1].trim();
      messageBody = match[2].trim();
    }
  }

  await recordApiUsage({
    source: usageSource,
    model: response.model,
    usage: response.usage,
  });

  return {
    message: messageBody,
    subject,
    model: response.model,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
