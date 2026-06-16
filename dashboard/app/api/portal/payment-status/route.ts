/**
 * GET /api/portal/payment-status
 *
 * Estado de pago del mes corriente del cliente autenticado. Lo consume
 * <PaymentCTA /> en el PortalHeader (barra de progreso + popover).
 *
 * Ventana de cobro fija: día 4 al 9 de cada mes.
 *   - status='paid'  → verde.
 *   - antes del día 4 (pendiente) → neutral, "Próximo pago".
 *   - día 4–9 (pendiente) → ámbar, "Vence en N días".
 *   - después del día 9 (pendiente / late) → rojo, "Vencido hace N días".
 *
 * Auth: Bearer token del cliente (role='client', con client_id).
 *
 * Response:
 *   {
 *     status: 'paid' | 'pending',
 *     color: 'green' | 'neutral' | 'amber' | 'red',
 *     label: string,
 *     daysToDue: number,       // hasta el día 9 (negativo si vencido)
 *     daysOverdue: number,     // 0 si no vencido; >0 días pasados del 9
 *     dayOfMonth: number,      // día actual (1-31)
 *     dueRangeStart: number,   // 4
 *     dueRangeEnd: number,     // 9
 *     progress: number,        // 0-1, avance del ciclo de pago del mes
 *     month: string,           // YYYY-MM
 *     monthLabel: string,      // "mayo"
 *     fee: number | null
 *   }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const DUE_RANGE_START = 4;
const DUE_RANGE_END = 9;

const MONTH_LABELS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

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
    .select("role, client_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile || profile.role !== "client" || !profile.client_id) {
    return Response.json(
      { error: "Este endpoint es solo para clientes finales." },
      { status: 403 },
    );
  }

  const clientId = profile.client_id as string;

  const now = new Date();
  const monthIso = now.toISOString().slice(0, 7);
  const monthNum = now.getUTCMonth();
  const monthLabel = MONTH_LABELS[monthNum];
  const dayOfMonth = now.getUTCDate();

  // Para el monto del mes actual NO usamos clients.fee — ese es solo
  // el fallback cuando el equipo todavía no emitió la factura. La
  // fuente de verdad es payments.amount_override del mes (la factura
  // real que se emitió), que puede ser distinta al fee base por
  // ajustes, prorrateos, ítems extra, etc.
  //
  // También traemos el historial de los últimos 6 meses para el
  // popover del PaymentCTA (muestra qué se facturó y qué se pagó).
  const sixMonthsAgoIso = (() => {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - 5);
    return d.toISOString().slice(0, 7);
  })();
  const [
    { data: paymentRow },
    { data: clientRow },
    { data: historyRows },
  ] = await Promise.all([
    admin
      .from("payments")
      .select("status, paid_date, amount_override")
      .eq("client_id", clientId)
      .eq("month", monthIso)
      .maybeSingle(),
    admin.from("clients").select("fee, name").eq("id", clientId).maybeSingle(),
    admin
      .from("payments")
      .select("month, status, paid_date, amount_override, pdf_url")
      .eq("client_id", clientId)
      .gte("month", sixMonthsAgoIso)
      .order("month", { ascending: false }),
  ]);

  const baseFee = clientRow?.fee ? Number(clientRow.fee) : null;
  // Monto del mes actual: amount_override (factura emitida) > fee base > null.
  const fee =
    paymentRow && paymentRow.amount_override != null
      ? Number(paymentRow.amount_override)
      : baseFee;
  const clientName = (clientRow?.name as string | undefined) ?? null;
  const paymentStatus = (paymentRow?.status ?? "pending") as
    | "paid"
    | "pending"
    | "late";

  // Historial: array ordenado más reciente primero, listo para el
  // popover. Cada fila tiene { month, monthLabel, status, amount,
  // paidDate, pdfUrl }. amount usa amount_override; si no hay,
  // marcamos null (no facturado aún).
  const history = (historyRows ?? []).map((r) => {
    const m = (r.month as string) ?? "";
    const idx = Number(m.slice(5, 7)) - 1;
    return {
      month: m,
      monthLabel:
        idx >= 0 && idx < 12 ? MONTH_LABELS[idx] : m,
      status: r.status as "paid" | "pending" | "late" | "cancelled",
      amount:
        r.amount_override != null ? Number(r.amount_override) : null,
      paidDate: r.paid_date as string | null,
      pdfUrl: r.pdf_url as string | null,
    };
  });

  // Campos comunes a todos los estados
  const base = {
    dayOfMonth,
    dueRangeStart: DUE_RANGE_START,
    dueRangeEnd: DUE_RANGE_END,
    month: monthIso,
    monthLabel,
    fee, // monto real del mes (factura emitida) — antes era clients.fee
    baseFee, // fee mensual base del cliente (para referencia / fallback)
    clientName,
    history, // últimos 6 meses {month, monthLabel, status, amount, paidDate, pdfUrl}
  };

  // PAGADO → verde, barra llena
  if (paymentStatus === "paid") {
    return Response.json({
      ...base,
      status: "paid",
      color: "green",
      label: `Pago de ${monthLabel} · al día`,
      daysToDue: 0,
      daysOverdue: 0,
      progress: 1,
    });
  }

  // ANTES DEL RANGO → neutral, barra baja
  if (dayOfMonth < DUE_RANGE_START) {
    return Response.json({
      ...base,
      status: "pending",
      color: "neutral",
      label: `Próximo pago: ${DUE_RANGE_START}–${DUE_RANGE_END} ${monthLabel}`,
      daysToDue: DUE_RANGE_END - dayOfMonth,
      daysOverdue: 0,
      // Progreso del mes hacia el inicio del rango (día 4)
      progress: Math.max(0, Math.min(dayOfMonth / DUE_RANGE_START, 1)) * 0.5,
    });
  }

  // EN VENTANA (4–9) → ámbar, barra alta
  if (dayOfMonth >= DUE_RANGE_START && dayOfMonth <= DUE_RANGE_END) {
    const daysLeft = DUE_RANGE_END - dayOfMonth;
    const windowSpan = DUE_RANGE_END - DUE_RANGE_START; // 5
    const intoWindow = (dayOfMonth - DUE_RANGE_START) / windowSpan; // 0..1
    return Response.json({
      ...base,
      status: "pending",
      color: "amber",
      label:
        daysLeft === 0
          ? "Vence hoy"
          : daysLeft === 1
            ? "Vence mañana"
            : `Vence en ${daysLeft} días`,
      daysToDue: daysLeft,
      daysOverdue: 0,
      // De 0.5 (día 4) a 1.0 (día 9)
      progress: 0.5 + intoWindow * 0.5,
    });
  }

  // VENCIDO (>9) → rojo, barra llena
  const daysOverdue = dayOfMonth - DUE_RANGE_END;
  return Response.json({
    ...base,
    status: "pending",
    color: "red",
    label:
      daysOverdue === 1
        ? "Vencido hace 1 día"
        : `Vencido hace ${daysOverdue} días`,
    daysToDue: -daysOverdue,
    daysOverdue,
    progress: 1,
  });
}
