/**
 * POST /api/portal/digest/send-all
 *
 * Endpoint del cron de GitHub Actions que dispara el envío del weekly
 * digest a todos los clientes activos. Auth via header
 *   Authorization: Bearer <DIGEST_CRON_SECRET>
 * (NO usa Supabase JWT — es server-to-server).
 *
 * Para cada cliente con status='active' AND type='gp':
 *   1. Buscar destinatario (profile role=client con weekly_digest_enabled)
 *   2. Computar stats últimos 7 días (buildWeeklyDigest)
 *   3. Si hay actividad → mandar email via Resend
 *   4. Si no hay actividad → skip silencioso
 *
 * Response: { sent, skipped, errors: string[] }
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/consultant-context";
import { sendEmail } from "@/lib/email";
import {
  buildWeeklyDigest,
  renderWeeklyDigestHtml,
} from "@/lib/portal-digest";

interface DigestSummary {
  sent: number;
  skipped: number;
  errors: string[];
}

export async function POST(req: NextRequest) {
  const expected = process.env.DIGEST_CRON_SECRET?.trim();
  if (!expected) {
    return Response.json(
      { error: "DIGEST_CRON_SECRET no configurado en el servidor." },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (auth !== expected) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: "Servidor no configurado (service role)." },
      { status: 500 },
    );
  }

  // Listar clientes activos tipo Growth Partner. Si querés ampliar a
  // type='dev' después, agregar otro filtro.
  const { data: clients, error: clientsErr } = await admin
    .from("clients")
    .select("id, name")
    .eq("status", "active")
    .eq("type", "gp");

  if (clientsErr) {
    return Response.json(
      { error: `No pude listar clientes: ${clientsErr.message}` },
      { status: 500 },
    );
  }

  const summary: DigestSummary = { sent: 0, skipped: 0, errors: [] };

  for (const client of clients ?? []) {
    try {
      const payload = await buildWeeklyDigest(admin, client.id);
      if (!payload) {
        summary.skipped += 1;
        continue;
      }
      const html = renderWeeklyDigestHtml(payload);
      const subject = `Tu semana en ${payload.clientName}`;
      await sendEmail({
        to: payload.recipientEmail,
        subject,
        html,
      });
      summary.sent += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${client.id}: ${msg}`);
      console.error(`[digest] error con ${client.id}:`, msg);
    }
  }

  return Response.json(summary);
}
