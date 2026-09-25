/**
 * Sync de Outlook → cal_events (server-only, service role).
 *
 * Dos caminos alimentan la misma tabla:
 *   - Webhook (/api/calendar/outlook/webhook): Microsoft avisa cada cambio.
 *   - Reconciliación (/api/calendar/outlook/subscribe, cron cada 6 h +
 *     botón "Sincronizar ahora"): trae el calendarView de la ventana y
 *     corrige lo que el webhook se haya perdido (Vercel caído, token vencido,
 *     subscription muerta). Sin esto, un aviso perdido era un evento que no
 *     entraba nunca.
 *
 * Los dos guardan con `upsertOutlookEvent`, así la resolución de cliente y
 * el formato de fila son idénticos.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getUserAccessToken,
  listCalendarView,
  type OutlookEvent,
} from "@/lib/microsoft-graph";

/** Ventana de reconciliación: una semana atrás, dos meses adelante. */
const WINDOW_PAST_DAYS = 7;
const WINDOW_FUTURE_DAYS = 60;

interface Owner {
  role: string | null;
  client_id: string | null;
}

async function loadOwner(admin: SupabaseClient, userId: string): Promise<Owner> {
  const { data } = await admin
    .from("profiles")
    .select("role, client_id")
    .eq("id", userId)
    .maybeSingle();
  return { role: data?.role ?? null, client_id: data?.client_id ?? null };
}

/**
 * client_id / client_label del evento:
 *   (a) dueño role='client' → su propio cliente;
 *   (b) team/director → el cliente cuyo contact_email esté entre los attendees;
 *   si no, "Personal" (client_label es NOT NULL).
 */
async function resolveClient(
  admin: SupabaseClient,
  owner: Owner,
  event: OutlookEvent,
): Promise<{ id: string | null; label: string }> {
  if (owner.role === "client" && owner.client_id) {
    const { data } = await admin
      .from("clients")
      .select("name")
      .eq("id", owner.client_id)
      .maybeSingle();
    return { id: owner.client_id, label: data?.name ?? owner.client_id };
  }
  const emails = (event.attendees ?? [])
    .map((a) => a.emailAddress.address?.toLowerCase())
    .filter((e): e is string => Boolean(e));
  if (emails.length > 0) {
    const { data } = await admin
      .from("clients")
      .select("id, name")
      .in("contact_email", emails)
      .limit(1);
    const m = data?.[0];
    if (m) return { id: m.id, label: m.name };
  }
  return { id: null, label: "Personal" };
}

function durationMinutes(event: OutlookEvent): number | null {
  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  const ms = new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : null;
}

/**
 * Inserta o actualiza el evento en cal_events (buscando por external_id: el
 * índice único es parcial y `ON CONFLICT` no lo matchea). Devuelve el error
 * como string, o null si salió bien.
 */
export async function upsertOutlookEvent(
  admin: SupabaseClient,
  userId: string,
  event: OutlookEvent,
  owner?: Owner,
): Promise<string | null> {
  if (!event.start?.dateTime) return `evento sin start.dateTime (${event.id})`;
  const who = owner ?? (await loadOwner(admin, userId));
  const client = await resolveClient(admin, who, event);

  const row: Record<string, unknown> = {
    owner_user_id: userId,
    client_id: client.id,
    client_label: client.label,
    title: event.subject || "(sin título)",
    date: event.start.dateTime.slice(0, 10),
    time: event.start.dateTime.slice(11, 16),
    type: "reunion",
    meet_link: event.onlineMeeting?.joinUrl ?? event.webLink ?? null,
    synced: true,
    external_id: event.id,
    source: "outlook",
  };
  const minutes = durationMinutes(event);
  if (minutes) row.duration = minutes;

  const { data: existing } = await admin
    .from("cal_events")
    .select("id")
    .eq("external_id", event.id)
    .maybeSingle();

  const { error } = existing
    ? await admin.from("cal_events").update(row).eq("id", existing.id)
    : await admin.from("cal_events").insert(row);
  return error ? `guardar evento: ${error.message}` : null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ReconcileResult {
  synced: number;
  removed: number;
  errors: number;
}

/**
 * Trae el calendarView del user y deja cal_events igual: upsert de cada
 * evento vigente y borrado de los source='outlook' de la ventana que ya no
 * están (cancelados o borrados en Outlook). Actualiza last_synced_at, o
 * last_error si algo falló. Tira si Graph falla (el caller lo registra).
 */
export async function reconcileOutlookUser(
  admin: SupabaseClient,
  userId: string,
): Promise<ReconcileResult> {
  const now = Date.now();
  const from = new Date(now - WINDOW_PAST_DAYS * 86400000);
  const to = new Date(now + WINDOW_FUTURE_DAYS * 86400000);

  const accessToken = await getUserAccessToken(admin, userId);
  const events = await listCalendarView(accessToken, from.toISOString(), to.toISOString());
  const owner = await loadOwner(admin, userId);

  let synced = 0;
  let errors = 0;
  let lastError: string | null = null;
  const live = new Set<string>();
  for (const event of events) {
    if (event.isCancelled || event.type === "seriesMaster") continue;
    live.add(event.id);
    const err = await upsertOutlookEvent(admin, userId, event, owner);
    if (err) {
      errors++;
      lastError = err;
    } else synced++;
  }

  // Lo que quedó guardado en la ventana y Outlook ya no devuelve → se fue.
  const { data: stored } = await admin
    .from("cal_events")
    .select("id, external_id")
    .eq("owner_user_id", userId)
    .eq("source", "outlook")
    .gte("date", isoDay(from))
    .lte("date", isoDay(to));
  const stale = (stored ?? [])
    .filter((r) => r.external_id && !live.has(r.external_id as string))
    .map((r) => r.id as string);
  if (stale.length > 0) {
    await admin.from("cal_events").delete().in("id", stale);
  }

  const stamp = new Date().toISOString();
  await admin
    .from("outlook_connections")
    .update(
      lastError
        ? { last_synced_at: stamp, last_error: lastError, last_error_at: stamp }
        : { last_synced_at: stamp, last_error: null, last_error_at: null },
    )
    .eq("user_id", userId);

  return { synced, removed: stale.length, errors };
}
