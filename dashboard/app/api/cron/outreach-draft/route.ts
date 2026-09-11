/**
 * POST /api/cron/outreach-draft — llena la cola de aprobación (mig 100)
 *
 * Por cada campaña activa, toma sus leads que todavía no tienen mensaje
 * para el canal y redacta el primer contacto con Claude. Los mensajes
 * quedan en `outreach_messages` con status='draft': NADA se envía acá.
 * El envío lo hace un humano desde /pipeline/mensajes.
 *
 * Lo llama el workflow de prospección justo después del agente, y se puede
 * disparar a mano. Devuelve `remaining` para que el caller itere.
 *
 * Idempotente: el unique index (lead_id, channel, sequence) + el filtro de
 * "leads sin ningún mensaje para ese canal" evitan duplicados. Un draft
 * descartado NO se vuelve a generar — descartar es una decisión.
 *
 * Auth: header `x-internal-secret` = CRON_SECRET.
 */

import { NextRequest } from "next/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  generateOutreachMessage,
  normalizeChannels,
  type OutreachChannel,
} from "@/lib/outreach-message";

export const dynamic = "force-dynamic";
// Redactar es secuencial (~4-6s por mensaje con Sonnet). Con 12 por corrida
// entra cómodo; el caller itera si queda trabajo.
export const maxDuration = 300;

const MAX_DRAFTS_PER_RUN = 12;

interface CampaignRow {
  id: string;
  name: string;
  channels: unknown;
  countries: string[] | null;
  regions: string[] | null;
  cities: string[] | null;
  industries: string[] | null;
  roles: string[] | null;
  seniorities: string[] | null;
  buying_signals: string[] | null;
  company_size_min: number | null;
  company_size_max: number | null;
  revenue_range: string | null;
  cta: "calendly" | "landing" | "custom" | null;
  cta_url: string | null;
  message_tone: string | null;
  value_angle: string | null;
  daily_volume: number | null;
}

interface LeadRow {
  id: string;
  name: string;
  company: string;
  /** 'gp' = growth · 'dev' = automatización e IA. Define el ángulo. */
  type: "gp" | "dev";
  sector: string | null;
  note: string | null;
  contact_email: string | null;
  contact_role: string | null;
  linkedin_url: string | null;
  source_url: string | null;
  job_title: string | null;
  role_requirements: string | null;
}

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      ok: true,
      configured: false,
      detail: "ANTHROPIC_API_KEY no está seteada — la cola queda dormida.",
      created: 0,
      remaining: 0,
    });
  }

  const admin = getSupabaseAdmin();

  const { data: campaigns, error: campErr } = await admin
    .from("prospect_campaigns")
    .select("*")
    .eq("status", "active");

  if (campErr) {
    return Response.json(
      { error: `no pude leer las campañas: ${campErr.message}` },
      { status: 500 },
    );
  }
  if (!campaigns || campaigns.length === 0) {
    return Response.json({
      ok: true,
      configured: false,
      detail: "Sin campañas activas — no hay a quién escribirle.",
      created: 0,
      remaining: 0,
    });
  }

  let created = 0;
  let remaining = 0;
  const errores: string[] = [];

  for (const campaign of campaigns as CampaignRow[]) {
    const channels = normalizeChannels(campaign.channels);
    if (channels.length === 0) continue;

    try {
      // Leads de la campaña que siguen vivos y no están cerrados.
      const { data: leads, error: leadErr } = await admin
        .from("leads")
        .select(
          "id, name, company, type, sector, note, contact_email, contact_role, linkedin_url, source_url, job_title, role_requirements",
        )
        .eq("campaign_id", campaign.id)
        .is("lost_at", null)
        .in("stage", ["prospecto", "contacto"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (leadErr) throw new Error(leadErr.message);
      if (!leads || leads.length === 0) continue;

      // Qué leads ya tienen mensaje (de cualquier estado, incluido
      // descartado) para no regenerar lo que alguien ya decidió.
      const { data: existing } = await admin
        .from("outreach_messages")
        .select("lead_id, channel")
        .in(
          "lead_id",
          leads.map((l) => l.id),
        );
      const taken = new Set(
        (existing ?? []).map((m) => `${m.lead_id}:${m.channel}`),
      );

      const pendientes: Array<{ lead: LeadRow; channel: OutreachChannel }> = [];
      for (const lead of leads as LeadRow[]) {
        // Email solo si sabemos a dónde escribir. El mail del decisor casi
        // nunca está en un aviso público (y la casilla genérica de la
        // empresa NO habilita el envío a propósito), así que la mayoría cae
        // a LinkedIn. Es la verdad del sistema, no un bug: generar mails sin
        // destinatario llenaría la cola de humo.
        const canal: OutreachChannel =
          lead.contact_email && channels.includes("email")
            ? "email"
            : channels.includes("linkedin")
              ? "linkedin"
              : channels[0];
        if (canal === "email" && !lead.contact_email) continue;
        if (taken.has(`${lead.id}:${canal}`)) continue;
        pendientes.push({ lead, channel: canal });
      }

      const cap = Math.min(
        campaign.daily_volume ?? MAX_DRAFTS_PER_RUN,
        MAX_DRAFTS_PER_RUN,
      );
      const lote = pendientes.slice(0, Math.max(0, cap - created));
      remaining += Math.max(0, pendientes.length - lote.length);

      for (const { lead, channel } of lote) {
        if (created >= MAX_DRAFTS_PER_RUN) {
          remaining += 1;
          continue;
        }
        try {
          const result = await generateOutreachMessage({
            campaign: {
              name: campaign.name,
              countries: campaign.countries ?? [],
              regions: campaign.regions ?? [],
              cities: campaign.cities ?? [],
              industries: campaign.industries ?? [],
              companySizeMin: campaign.company_size_min ?? undefined,
              companySizeMax: campaign.company_size_max ?? undefined,
              revenueRange: campaign.revenue_range ?? undefined,
              buyingSignals: campaign.buying_signals ?? [],
              roles: campaign.roles ?? [],
              seniorities: campaign.seniorities ?? [],
              cta: campaign.cta ?? "calendly",
              ctaUrl: campaign.cta_url ?? undefined,
              messageTone: campaign.message_tone ?? undefined,
              valueAngle: campaign.value_angle ?? undefined,
            },
            lead: {
              name: lead.name,
              company: lead.company,
              role: lead.contact_role ?? undefined,
              sector: lead.sector ?? undefined,
              linkedin: lead.linkedin_url ?? undefined,
              email: lead.contact_email ?? undefined,
              notes: lead.note ?? undefined,
              sourceUrl: lead.source_url ?? undefined,
              vertical: lead.type === "dev" ? "dev" : "growth",
              jobTitle: lead.job_title ?? undefined,
              roleRequirements: lead.role_requirements ?? undefined,
            },
            channel,
            usageSource: "dashboard:outreach-draft",
          });

          const { error: insErr } = await admin.from("outreach_messages").upsert(
            {
              lead_id: lead.id,
              campaign_id: campaign.id,
              channel,
              sequence: 0,
              subject: result.subject ?? null,
              body: result.message,
              status: "draft",
              to_email: channel === "email" ? lead.contact_email : null,
              model: result.model,
            },
            { onConflict: "lead_id,channel,sequence", ignoreDuplicates: true },
          );
          if (insErr) throw new Error(insErr.message);
          created += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          errores.push(`${lead.company}: ${msg}`);
        }
      }
    } catch (err) {
      errores.push(
        `campaña ${campaign.name}: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  // Avisar solo si hay algo para revisar.
  if (created > 0) {
    await admin.from("notifications").upsert(
      {
        client: null,
        agent: "prospeccion",
        level: "info",
        title: `${created} mensaje(s) esperando tu aprobación`,
        body: `La IA redactó los primeros contactos de los prospectos nuevos. Revisalos y aprobá los que salgan — nada se manda solo.`,
        link: "/pipeline/mensajes",
        to_role: "director",
        email_sent: false,
        dedup_key: `outreach-draft-${new Date().toISOString().slice(0, 10)}`,
      },
      { onConflict: "dedup_key", ignoreDuplicates: true },
    );
  }

  return Response.json({
    ok: true,
    configured: true,
    created,
    remaining,
    errores: errores.slice(0, 10),
  });
}
