/**
 * POST /api/cron/billing — FIN-1 · Facturación recurrente + cobranzas
 *
 * Corre 1×/día desde GitHub Actions (workflow "Facturación y cobranzas").
 * Dos pasos, ambos idempotentes:
 *
 *   A. RUNNER DE FACTURACIÓN — draftea en `payments` las facturas del mes
 *      en curso que falten (status 'pending'), una por cliente con fee
 *      efectivo > 0, en la moneda del cliente. Después del día 1 se vuelve
 *      no-op (el PK client_id+month evita duplicados). Cuando draftea algo,
 *      registra la corrida en `invoice_runs` y avisa al director.
 *
 *   B. COBRANZAS — detecta facturas vencidas (due = clients.billing_day,
 *      o último día del mes si es NULL), las marca 'late' y draftea un
 *      recordatorio en tono D&C como notificación al director (cadencia
 *      mínima 4 días entre avisos por factura). Del 2º aviso en adelante
 *      se marca ESCALADO A SOCIOS.
 *
 * Gates (doc 12/16 — YELLOW): este cron NUNCA emite facturas ni manda
 * mails al cliente. Draftea y avisa; emitir y enviar es humano.
 *
 * Auth: header `x-internal-secret` = CRON_SECRET (requireInternalSecret).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { requireInternalSecret } from "@/lib/auth-guard";
import {
  currentMonthUY,
  todayUY,
  feeEfectivoDelMes,
  asFinanceCurrency,
} from "@/lib/tesoreria";

export const dynamic = "force-dynamic";

/** Días mínimos entre recordatorios de la misma factura. */
const REMINDER_COOLDOWN_DAYS = 4;

interface ClientRow {
  id: string;
  name: string;
  contact_name: string | null;
  fee: number | string | null;
  fee_currency: string | null;
  status: string | null;
  billing_day: number | null;
}

interface PaymentRow {
  client_id: string;
  month: string;
  status: string;
  amount_override: number | string | null;
  reminder_count: number;
  last_reminder_at: string | null;
}

interface ScheduleRow {
  client_id: string;
  start_month: string;
  end_month: string | null;
  amount: number | string;
}

/** Último día (1-31) del mes YYYY-MM. */
function lastDayOfMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Fecha de vencimiento YYYY-MM-DD de la factura de `month` para un cliente. */
function dueDateFor(month: string, billingDay: number | null): string {
  const last = lastDayOfMonth(month);
  const day = billingDay ? Math.min(billingDay, last) : last;
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Días entre dos fechas YYYY-MM-DD (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("es-UY");
}

export async function POST(req: NextRequest) {
  const guard = requireInternalSecret(req);
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  const month = currentMonthUY();
  const today = todayUY();

  const [{ data: clients }, { data: schedules }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, contact_name, fee, fee_currency, status, billing_day")
      .returns<ClientRow[]>(),
    supabase
      .from("client_fee_schedules")
      .select("client_id, start_month, end_month, amount")
      .returns<ScheduleRow[]>(),
  ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

  const effectiveFee = (c: ClientRow, mk: string): number =>
    feeEfectivoDelMes(
      { id: c.id, fee: c.fee, fee_currency: c.fee_currency },
      schedules ?? [],
      mk,
    );

  // ============ A. Runner de facturación (mes en curso) ============
  const { data: monthPayments } = await supabase
    .from("payments")
    .select("client_id, month, status, amount_override, reminder_count, last_reminder_at")
    .eq("month", month)
    .returns<PaymentRow[]>();

  const alreadyBilled = new Set((monthPayments ?? []).map((p) => p.client_id));

  const toDraft = (clients ?? []).filter(
    (c) => !alreadyBilled.has(c.id) && effectiveFee(c, month) > 0,
  );

  let drafted = 0;
  if (toDraft.length > 0) {
    const { error: draftErr } = await supabase.from("payments").upsert(
      toDraft.map((c) => ({
        client_id: c.id,
        month,
        status: "pending",
      })),
      { onConflict: "client_id,month", ignoreDuplicates: true },
    );
    if (draftErr) {
      return Response.json(
        { error: `Draft de facturas falló: ${draftErr.message}` },
        { status: 500 },
      );
    }
    drafted = toDraft.length;

    const details = toDraft.map((c) => ({
      client_id: c.id,
      amount: effectiveFee(c, month),
      currency: asFinanceCurrency(c.fee_currency),
    }));
    await supabase.from("invoice_runs").insert({
      month,
      drafted,
      existing: alreadyBilled.size,
      details,
    });

    // Total por moneda para el aviso.
    const totals: Record<string, number> = {};
    for (const d of details) {
      totals[d.currency] = (totals[d.currency] ?? 0) + d.amount;
    }
    const totalsTxt = Object.entries(totals)
      .map(([cur, amt]) => `${cur} ${fmt(amt)}`)
      .join(" + ");

    await supabase.from("notifications").insert({
      client: null,
      agent: "facturacion",
      level: "success",
      title: `Facturas de ${monthLabel(month)} drafteadas (${drafted})`,
      body: `El runner creó ${drafted} factura(s) pendiente(s) por un total de ${totalsTxt}: ${toDraft
        .map((c) => c.name)
        .join(", ")}. Revisá Finanzas → Facturación — emitir y enviar sigue siendo manual.`,
      link: "/finanzas",
      to_role: "director",
      email_sent: false,
    });
  }

  // ============ B. Cobranzas (vencidas de cualquier mes) ============
  const { data: openPayments } = await supabase
    .from("payments")
    .select("client_id, month, status, amount_override, reminder_count, last_reminder_at")
    .in("status", ["pending", "late"])
    .returns<PaymentRow[]>();

  let lateMarked = 0;
  let remindersSent = 0;

  for (const p of openPayments ?? []) {
    const client = clientById.get(p.client_id);
    if (!client) continue;

    const due = dueDateFor(p.month, client.billing_day ?? null);
    const daysOverdue = daysBetween(due, today);
    if (daysOverdue <= 0) continue; // todavía no venció

    // Marcar 'late' si sigue 'pending'.
    if (p.status === "pending") {
      const { error: lateErr } = await supabase
        .from("payments")
        .update({ status: "late" })
        .eq("client_id", p.client_id)
        .eq("month", p.month);
      if (!lateErr) lateMarked++;
    }

    // Cadencia: primer aviso apenas vence; después cada 4 días.
    const lastReminder = p.last_reminder_at?.slice(0, 10) ?? null;
    const cooled =
      !lastReminder || daysBetween(lastReminder, today) >= REMINDER_COOLDOWN_DAYS;
    if (!cooled) continue;

    const amountOverride =
      p.amount_override == null
        ? null
        : typeof p.amount_override === "string"
          ? parseFloat(p.amount_override)
          : p.amount_override;
    const amount = amountOverride ?? effectiveFee(client, p.month);
    const currency = asFinanceCurrency(client.fee_currency);
    const noticeNumber = p.reminder_count + 1;
    const escalated = noticeNumber >= 2;
    const contact = client.contact_name?.split(" ")[0] || "!";

    const reminderDraft = `Hola ${contact}! Te escribimos de D&C Scale. Te recordamos que quedó pendiente el pago del fee de ${monthLabel(p.month)} (${currency} ${fmt(amount)}). ¿Nos confirmás cuándo lo estarías realizando? ¡Gracias!`;

    const { error: notifErr } = await supabase.from("notifications").insert({
      client: p.client_id,
      agent: "cobranzas",
      level: "warning",
      title: escalated
        ? `${noticeNumber}º AVISO — ${client.name} · ${monthLabel(p.month)} vencida hace ${daysOverdue} días (escalado a socios)`
        : `Factura vencida: ${client.name} · ${monthLabel(p.month)} (${daysOverdue} días)`,
      body: `${client.name} debe ${currency} ${fmt(amount)} de ${monthLabel(p.month)} (venció el ${due}).\n\nBorrador de recordatorio — revisar y enviar por el canal habitual (el sistema NO le escribe al cliente):\n«${reminderDraft}»`,
      link: "/finanzas",
      to_role: "director",
      email_sent: false,
    });

    if (!notifErr) {
      await supabase
        .from("payments")
        .update({
          reminder_count: noticeNumber,
          last_reminder_at: new Date().toISOString(),
        })
        .eq("client_id", p.client_id)
        .eq("month", p.month);
      remindersSent++;
    }
  }

  return Response.json({
    ok: true,
    month,
    facturacion: { drafted, existing: alreadyBilled.size },
    cobranzas: {
      abiertas: (openPayments ?? []).length,
      lateMarked,
      remindersSent,
    },
  });
}
