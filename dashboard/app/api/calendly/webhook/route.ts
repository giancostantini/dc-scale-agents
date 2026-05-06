/**
 * POST /api/calendly/webhook
 *
 * Recibe eventos de Calendly cuando un invitee agenda una reunión.
 * Calendly envía `invitee.created` con el detalle del booking.
 *
 * Lo que hacemos:
 *   1. Validar la firma HMAC SHA-256 del payload (header
 *      `Calendly-Webhook-Signature`) usando CALENDLY_WEBHOOK_SECRET.
 *   2. Si el evento es `invitee.created`:
 *      a. Buscar el lead correspondiente (por email del invitee).
 *         - Si existe: actualizar meeting_booked = true.
 *         - Si no existe: crear uno nuevo con stage = 'prospecto' y
 *           meeting_booked = true (caso del usuario que entra directo
 *           a Calendly sin pasar por la landing).
 *      b. Crear un row en `cal_events` con la fecha/hora del booking.
 *
 * Calendly Webhooks requieren plan paid (Standard o superior).
 * Si tu plan es Free, este endpoint queda dormido sin afectar nada;
 * los leads se crean igual desde el modal pre-form.
 */

import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";

interface CalendlyInviteePayload {
  event: string;
  created_at: string;
  payload: {
    email: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    event?: {
      start_time?: string;
      end_time?: string;
      location?: { join_url?: string; type?: string };
    };
    questions_and_answers?: Array<{
      question: string;
      answer: string;
      position: number;
    }>;
    scheduled_event?: {
      start_time?: string;
      end_time?: string;
      name?: string;
      location?: { join_url?: string; type?: string };
    };
  };
}

/** Validate Calendly's HMAC signature. Returns true if valid. */
function verifyCalendlySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  // Format: "t=TIMESTAMP,v1=SIGNATURE"
  const parts = signatureHeader.split(",").reduce<Record<string, string>>(
    (acc, p) => {
      const [k, v] = p.split("=");
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    },
    {},
  );

  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;

  const signedPayload = `${ts}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  // timing-safe comparison
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

function extractAnswers(qas?: Array<{ question: string; answer: string; position: number }>) {
  if (!qas || qas.length === 0) return { reason: "", company: "" };
  // Calendly's first custom question is index 0 (a1), second is 1 (a2)
  // Convención: a1 = "¿Por qué te contactás?", a2 = "Empresa"
  const sorted = [...qas].sort((a, b) => a.position - b.position);
  return {
    reason: sorted[0]?.answer ?? "",
    company: sorted[1]?.answer ?? "",
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.CALENDLY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[calendly-webhook] CALENDLY_WEBHOOK_SECRET no configurada");
    return Response.json(
      { ok: false, error: "webhook_not_configured" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("calendly-webhook-signature");

  if (!verifyCalendlySignature(rawBody, sigHeader, secret)) {
    console.warn("[calendly-webhook] invalid signature");
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let body: CalendlyInviteePayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.event !== "invitee.created") {
    // Ignoramos otros eventos (cancelaciones, reschedules) por ahora.
    // Cuando los necesitemos, agregamos handlers en este mismo endpoint.
    return Response.json({ ok: true, ignored: body.event }, { status: 200 });
  }

  const p = body.payload;
  const email = p.email?.trim().toLowerCase() ?? "";
  const name =
    p.name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    "Sin nombre";

  const startISO = p.scheduled_event?.start_time || p.event?.start_time;
  const meetLink =
    p.scheduled_event?.location?.join_url || p.event?.location?.join_url || null;
  const eventTitle = p.scheduled_event?.name || "Reunión Calendly";

  if (!email || !startISO) {
    return Response.json(
      { ok: false, error: "missing_required_fields", got: { email, startISO } },
      { status: 400 },
    );
  }

  const start = new Date(startISO);
  const dateStr = start.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = start.toTimeString().slice(0, 5); // HH:MM

  const { reason, company: answeredCompany } = extractAnswers(p.questions_and_answers);
  const company = answeredCompany || "—";

  try {
    const supabase = getSupabaseAdmin();

    // 1. Buscar lead por email en note (lo que insertamos en /from-landing)
    const { data: existingLead, error: searchErr } = await supabase
      .from("leads")
      .select("id, name, company, note, meeting_booked")
      .ilike("note", `%${email}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (searchErr) console.error("[calendly-webhook] search error:", searchErr);

    let leadId: string;

    if (existingLead) {
      // Update: marcar como booked y agregar nota de la reunión agendada
      const noteAddon =
        `\n\n[BOOKING CONFIRMADO ${new Date().toISOString()}]\n` +
        `Cuándo: ${dateStr} ${timeStr}\n` +
        `Meet: ${meetLink ?? "—"}\n` +
        (reason ? `Motivo (Calendly): ${reason}` : "");

      const { error: updErr } = await supabase
        .from("leads")
        .update({
          meeting_booked: true,
          note: `${existingLead.note ?? ""}${noteAddon}`,
        })
        .eq("id", existingLead.id);

      if (updErr) console.error("[calendly-webhook] update lead error:", updErr);

      leadId = existingLead.id;
    } else {
      // Crear lead nuevo: alguien que agendó sin pasar por la landing
      const noteText =
        `Reunión agendada vía Calendly directamente.\n\n` +
        `Email: ${email}\n` +
        `Cuándo: ${dateStr} ${timeStr}\n` +
        `Meet: ${meetLink ?? "—"}\n` +
        (reason ? `Motivo: ${reason}` : "");

      const { data: newLead, error: insErr } = await supabase
        .from("leads")
        .insert({
          name,
          company,
          sector: "—",
          type: "gp",
          value: 0,
          stage: "prospecto",
          source: "manual",
          note: noteText,
          meeting_booked: true,
        })
        .select("id")
        .single();

      if (insErr || !newLead) {
        console.error("[calendly-webhook] insert lead error:", insErr);
        return Response.json(
          { ok: false, error: "lead_insert_failed" },
          { status: 500 },
        );
      }

      leadId = newLead.id;
    }

    // 2. Insertar en cal_events
    const { error: calErr } = await supabase.from("cal_events").insert({
      title: `${eventTitle} · ${name}`,
      type: "reunion",
      date: dateStr,
      time: timeStr,
      duration: 30,
      client_label: company,
      participants: `${name} (${email}) · Federico Dearmas · Gianluca Costantini`,
      notes: reason || `Booking vía Calendly · lead ${leadId}`,
      meet_link: meetLink,
      synced: true,
    });

    if (calErr) {
      console.error("[calendly-webhook] cal_events insert error:", calErr);
      return Response.json(
        { ok: false, error: "calendar_insert_failed", leadId },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, leadId }, { status: 200 });
  } catch (err) {
    console.error("[calendly-webhook] unexpected error:", err);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
