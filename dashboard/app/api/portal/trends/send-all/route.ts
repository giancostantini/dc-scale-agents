/**
 * POST /api/portal/trends/send-all
 *
 * Envía el mail semanal de tendencias a cada cliente Growth Partner activo que
 * tenga tendencias generadas y no haya optado por NO recibir mails. Lo llama el
 * workflow `sector-trends.yml` tras generar las tendencias.
 *
 * Auth: Bearer ${DIGEST_CRON_SECRET} (reusa el secret del digest semanal).
 *
 * Respeta `profiles.weekly_digest_enabled` como opt-out (mismo que el digest).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { emailSectorTrendsToClient } from "@/lib/email";

export const dynamic = "force-dynamic";

interface TrendItem {
  title: string;
  summary?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export async function POST(req: NextRequest) {
  const secret = process.env.DIGEST_CRON_SECRET;
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!secret || auth !== secret) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: clients } = await admin
    .from("clients")
    .select("id, name, contact_email")
    // GP incluidos onboarding (ej. WizTrip); los DEV quedan afuera por type.
    .eq("type", "gp");

  const results = { sent: 0, skipped: 0, errors: [] as string[] };

  for (const c of clients ?? []) {
    const clientId = c.id as string;
    try {
      // Última corrida de tendencias
      const { data: output } = await admin
        .from("agent_outputs")
        .select("structured")
        .eq("client", clientId)
        .eq("output_type", "sector-trends")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const items =
        ((output?.structured ?? {}) as { items?: TrendItem[] }).items ?? [];
      if (items.length === 0) {
        results.skipped++;
        continue;
      }

      // Email del cliente + preferencia de opt-out
      const { data: prof } = await admin
        .from("profiles")
        .select("email, weekly_digest_enabled")
        .eq("client_id", clientId)
        .eq("role", "client")
        .limit(1)
        .maybeSingle();

      if (prof && prof.weekly_digest_enabled === false) {
        results.skipped++;
        continue;
      }

      // Destinatarios: usuario del portal + contactos de referencia
      // con email. Si el usuario del portal optó-out por
      // weekly_digest_enabled, salteamos TODO (incluyendo contactos)
      // — respetamos la voluntad del cliente principal de no recibir
      // el digest. Si no hay portal user, caemos al contact_email
      // legacy + contactos para no perder el envío.
      const recipients: string[] = [];
      if (prof?.email) recipients.push(prof.email);
      const { data: contacts } = await admin
        .from("client_contacts")
        .select("email")
        .eq("client_id", clientId)
        .not("email", "is", null);
      for (const cc of contacts ?? []) {
        if (cc.email) recipients.push(cc.email);
      }
      if (recipients.length === 0) {
        const legacy = (c.contact_email as string | null) ?? null;
        if (legacy) recipients.push(legacy);
      }
      // Dedupe case-insensitive
      const seen = new Set<string>();
      const unique = recipients.filter((e) => {
        const l = e.trim().toLowerCase();
        if (!l || seen.has(l)) return false;
        seen.add(l);
        return true;
      });
      if (unique.length === 0) {
        results.skipped++;
        continue;
      }

      await emailSectorTrendsToClient({
        clientEmail: unique,
        clientName: (c.name as string) ?? clientId,
        items,
      });
      results.sent++;
    } catch (err) {
      results.errors.push(
        `${clientId}: ${err instanceof Error ? err.message : "error"}`,
      );
    }
  }

  return Response.json({ ok: true, ...results });
}
