/**
 * POST /api/outreach/send — aprobar y enviar mensajes de la cola
 *
 * Este es el gate humano: hasta acá nada salió. El body trae los ids que
 * la persona aprobó.
 *
 *   - channel='email'    → se manda por Resend (remitente de outbound
 *                          aparte) y queda 'sent'.
 *   - channel='linkedin' → NO se automatiza (viola los términos de
 *                          LinkedIn y arriesga la cuenta). El browser ya
 *                          copió el texto; acá solo se registra 'sent'.
 *
 * Body: { ids: string[] }
 * Response: { results: [{ id, ok, error? }], sent, failed }
 *
 * Auth: director o team con acceso al pipeline.
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth-guard";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendOutreachEmail, outboundEmailStatus } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Resend limita a ~2 req/s: espaciamos para no comernos 429s. */
const GAP_MS = 600;

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["director", "team"]);
  if (!access.ok) return access.response;

  let ids: string[];
  try {
    const body = (await req.json()) as { ids?: string[] };
    ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  if (ids.length === 0) {
    return Response.json({ error: "Faltan ids de mensajes" }, { status: 400 });
  }
  if (ids.length > 50) {
    return Response.json(
      { error: "Máximo 50 mensajes por tanda." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: messages, error } = await admin
    .from("outreach_messages")
    .select("id, lead_id, channel, subject, body, status, to_email")
    .in("id", ids);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const emailStatus = outboundEmailStatus();
  let isFirstEmail = true;

  for (const m of messages ?? []) {
    if (m.status === "sent") {
      results.push({ id: m.id, ok: true });
      continue;
    }

    const nowIso = new Date().toISOString();

    // LinkedIn: el envío es manual por definición. Solo registramos.
    if (m.channel === "linkedin") {
      const { error: upErr } = await admin
        .from("outreach_messages")
        .update({
          status: "sent",
          approved_at: nowIso,
          approved_by: access.userId,
          sent_at: nowIso,
          error: null,
        })
        .eq("id", m.id);
      results.push({
        id: m.id,
        ok: !upErr,
        error: upErr?.message,
      });
      continue;
    }

    // Email: exige setup del canal de outbound y una dirección.
    if (!emailStatus.configured) {
      results.push({ id: m.id, ok: false, error: emailStatus.reason });
      continue;
    }
    if (!m.to_email) {
      results.push({
        id: m.id,
        ok: false,
        error: "El prospecto no tiene email cargado — pegalo en la ficha del lead.",
      });
      continue;
    }

    if (!isFirstEmail) await new Promise((r) => setTimeout(r, GAP_MS));
    isFirstEmail = false;

    try {
      const sent = await sendOutreachEmail({
        to: m.to_email,
        subject: m.subject || "Hola",
        text: m.body,
      });
      await admin
        .from("outreach_messages")
        .update({
          status: "sent",
          approved_at: nowIso,
          approved_by: access.userId,
          sent_at: nowIso,
          provider_message_id: sent.id,
          error: null,
        })
        .eq("id", m.id);
      results.push({ id: m.id, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "envío fallido";
      await admin
        .from("outreach_messages")
        .update({ status: "failed", error: msg.slice(0, 500) })
        .eq("id", m.id);
      results.push({ id: m.id, ok: false, error: msg });
    }
  }

  return Response.json({
    results,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
