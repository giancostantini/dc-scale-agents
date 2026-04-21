/**
 * POST /api/generate-message
 *
 * Genera un mensaje outbound personalizado usando Claude Opus 4.7.
 * Server-side: ANTHROPIC_API_KEY nunca llega al navegador.
 *
 * Body:
 *   campaign: ProspectCampaign — define ICP, tono y CTA
 *   lead:     { name, company, role, sector, linkedin?, email?, notes? }
 *   channel:  "linkedin" | "email"
 *
 * Response:
 *   { message, subject?, usage, model }
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

// System prompt: voz de marca D&C — estable, se cachea automáticamente
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

interface CampaignPayload {
  name?: string;
  countries: string[];
  regions?: string[];
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

interface LeadPayload {
  name: string;
  company: string;
  role?: string;
  sector?: string;
  linkedin?: string;
  email?: string;
  notes?: string;
}

interface RequestBody {
  campaign: CampaignPayload;
  lead: LeadPayload;
  channel: "linkedin" | "email";
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { campaign, lead, channel } = body;

  if (!campaign || !lead || !channel) {
    return Response.json(
      { error: "Missing required fields: campaign, lead, channel" },
      { status: 400 },
    );
  }
  if (channel !== "linkedin" && channel !== "email") {
    return Response.json(
      { error: "channel must be 'linkedin' or 'email'" },
      { status: 400 },
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY no configurada. Agregala a .env.local (local) o a Vercel env vars (producción).",
      },
      { status: 500 },
    );
  }

  const client = new Anthropic();

  // Build user message — varía por request, no se cachea
  const userMessage = buildUserPrompt(campaign, lead, channel);

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" }, // cachea el prefijo estable
        },
      ],
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: userMessage }],
    });

    // Extraer el bloque de texto (Opus 4.7 puede devolver thinking block antes)
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json(
        { error: "Respuesta de Claude sin texto" },
        { status: 500 },
      );
    }

    const rawText = textBlock.text.trim();

    // Para email: parsear Subject: y body
    let subject: string | undefined;
    let messageBody = rawText;
    if (channel === "email") {
      const match = rawText.match(/^Subject:\s*(.+?)\n\s*\n([\s\S]+)$/i);
      if (match) {
        subject = match[1].trim();
        messageBody = match[2].trim();
      }
    }

    return Response.json({
      message: messageBody,
      subject,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheCreation: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
      model: response.model,
    });
  } catch (err) {
    console.error("Claude API error:", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY inválida o revocada." },
        { status: 401 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Rate limit alcanzado. Esperá unos segundos." },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Claude API: ${err.message}` },
        { status: err.status ?? 500 },
      );
    }
    return Response.json(
      { error: "Error inesperado al llamar a Claude" },
      { status: 500 },
    );
  }
}

function buildUserPrompt(
  campaign: CampaignPayload,
  lead: LeadPayload,
  channel: "linkedin" | "email",
): string {
  const lines: string[] = [];

  lines.push("CAMPAIGN ICP:");
  if (campaign.countries.length) lines.push(`- Countries: ${campaign.countries.join(", ")}`);
  if (campaign.regions?.length) lines.push(`- Regions: ${campaign.regions.join(", ")}`);
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
  lines.push(`- Name: ${lead.name}`);
  lines.push(`- Company: ${lead.company}`);
  if (lead.role) lines.push(`- Role: ${lead.role}`);
  if (lead.sector) lines.push(`- Sector: ${lead.sector}`);
  if (lead.linkedin) lines.push(`- LinkedIn URL: ${lead.linkedin}`);
  if (lead.email) lines.push(`- Email: ${lead.email}`);
  if (lead.notes) lines.push(`- Notes about this lead: ${lead.notes}`);

  lines.push("");
  lines.push(
    channel === "linkedin"
      ? "Write a LinkedIn FIRST-TOUCH message to this prospect. Follow the LinkedIn rules strictly. Return ONLY the message body."
      : "Write a COLD EMAIL first-touch to this prospect. Follow the Email rules strictly. Return in the format 'Subject: ...\\n\\n[body]'.",
  );

  return lines.join("\n");
}
