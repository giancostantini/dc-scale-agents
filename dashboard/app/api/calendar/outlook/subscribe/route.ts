/**
 * POST /api/calendar/outlook/subscribe
 *
 * Crea o renueva la subscription a Microsoft Graph para events del director.
 * Llamada por:
 *   - Setup inicial (manual, una vez): curl con director auth → arranca el sync.
 *   - Cron diario (.github/workflows/outlook-subscription-renew.yml): renueva
 *     subscriptions que vencen en <2 días. Si ya expiraron (404 al renovar),
 *     crea una nueva.
 *
 * Auth: Bearer token de un user con role='director', O bien header
 *       `x-cron-secret: <SECRET>` para el cron (sin sesión interactiva).
 *
 * Response:
 *   { mode: 'created' | 'renewed', subscription_id, expires_at, resource }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createSubscription,
  renewSubscription,
} from "@/lib/microsoft-graph";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const directorUserId = process.env.MS_DIRECTOR_USER_ID?.trim();
  const webhookUrl = process.env.MS_WEBHOOK_URL?.trim();
  const clientState = process.env.MS_WEBHOOK_CLIENT_STATE?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!url || !anonKey || !serviceKey || !directorUserId || !webhookUrl || !clientState) {
    return Response.json(
      { error: "Servidor no configurado: faltan env vars Microsoft Graph." },
      { status: 500 },
    );
  }

  // ===== Auth: director Bearer OR cron secret =====
  const providedCronSecret = req.headers.get("x-cron-secret");
  const isCron =
    cronSecret && providedCronSecret && providedCronSecret === cronSecret;

  if (!isCron) {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return Response.json({ error: "Sin sesión" }, { status: 401 });

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user: authUser },
    } = await callerClient.auth.getUser();
    if (!authUser) return Response.json({ error: "No autenticado" }, { status: 401 });

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profile?.role !== "director") {
      return Response.json(
        { error: "Solo el director puede manejar el sync de Outlook." },
        { status: 403 },
      );
    }
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const resource = `/users/${directorUserId}/events`;

  // ===== Buscar subscription existente para este resource =====
  const { data: existing } = await admin
    .from("outlook_subscriptions")
    .select("id, subscription_id, expires_at")
    .eq("resource", resource)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Si existe Y todavía no expiró → renovar
  if (existing && new Date(existing.expires_at) > new Date()) {
    try {
      const renewed = await renewSubscription(existing.subscription_id);
      if (renewed) {
        await admin
          .from("outlook_subscriptions")
          .update({
            expires_at: renewed.expirationDateTime,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        return Response.json({
          mode: "renewed",
          subscription_id: renewed.id,
          expires_at: renewed.expirationDateTime,
          resource,
        });
      }
      // null = 404 → cayó la subscription, crear una nueva más abajo
    } catch (err) {
      console.error("[outlook/subscribe] renew falló, recreando:", err);
    }
  }

  // ===== Crear nueva subscription =====
  try {
    const created = await createSubscription({
      resource,
      changeType: "created,updated,deleted",
      notificationUrl: webhookUrl,
      clientState,
    });

    // Si existía la row, borrarla (subscription_id viejo no sirve más)
    if (existing) {
      await admin
        .from("outlook_subscriptions")
        .delete()
        .eq("id", existing.id);
    }

    await admin.from("outlook_subscriptions").insert({
      subscription_id: created.id,
      resource: created.resource,
      expires_at: created.expirationDateTime,
      client_state: clientState,
    });

    return Response.json({
      mode: "created",
      subscription_id: created.id,
      expires_at: created.expirationDateTime,
      resource,
    });
  } catch (err) {
    console.error("[outlook/subscribe] create falló:", err);
    return Response.json(
      {
        error: err instanceof Error ? err.message : "create subscription failed",
      },
      { status: 502 },
    );
  }
}
