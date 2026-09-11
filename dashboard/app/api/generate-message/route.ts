/**
 * POST /api/generate-message
 *
 * Preview interactivo de un mensaje outbound. La redacción vive en
 * lib/outreach-message.ts, compartida con el cron que llena la cola de
 * aprobación (/api/cron/outreach-draft).
 *
 * Auth: director o team. Antes este endpoint no tenía NINGÚN guard — era
 * un POST público que gastaba tokens de Claude con payload arbitrario.
 *
 * Body:
 *   campaign: ProspectCampaign — define ICP, tono y CTA
 *   lead:     { name, company, role?, sector?, linkedin?, email?, notes? }
 *   channel:  "linkedin" | "email"
 *
 * Response:
 *   { message, subject?, usage, model }
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import {
  generateOutreachMessage,
  type OutreachCampaign,
  type OutreachLead,
  type OutreachChannel,
} from "@/lib/outreach-message";

interface RequestBody {
  campaign: OutreachCampaign;
  lead: OutreachLead;
  channel: OutreachChannel;
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["director", "team"]);
  if (!access.ok) return access.response;

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

  try {
    const result = await generateOutreachMessage({ campaign, lead, channel });
    return Response.json(result);
  } catch (err) {
    console.error("generate-message error:", err);
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
      { error: err instanceof Error ? err.message : "Error inesperado al llamar a Claude" },
      { status: 500 },
    );
  }
}
