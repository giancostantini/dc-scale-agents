/**
 * GET /api/portal/payment-status
 *
 * Devuelve el estado de pago del mes corriente del cliente autenticado.
 * Lo consume <PaymentCTA /> en el PortalHeader y lo refresca cada 5 min.
 *
 * Reglas de pago:
 *   - Ventana de cobro: día 4 al 9 de cada mes (fijo para todos los clientes
 *     por ahora; configurable en futuro vía clients.fee_due_day).
 *   - status='paid'  → verde, "Pago de [mes] · al día".
 *   - Antes del día 4 con status pendiente → neutro, "Próximo pago: 4–9 [mes]".
 *   - Día 4–9 con status pendiente → ámbar, "Vence en N día(s)".
 *   - Después del día 9 con status pendiente o 'late' → rojo, "Vencido hace N día(s)".
 *
 * Auth: Bearer token del cliente (role='client', con client_id).
 *
 * Response:
 *   {
 *     status: 'paid' | 'pending',
 *     color: 'green' | 'neutral' | 'amber' | 'red',
 *     label: string,
 *     daysToDue: number,      // positivo = días hasta el 9; negativo = días vencido
 *     month: string,          // YYYY-MM
 *     monthLabel: string,     // "mayo"
 *     fee: number | null      // USD/mes desde clients.fee
 *   }
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Ventana de cobro fija por ahora — día 4 al 9 del mes
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

  // Mes corriente en UY (UTC-3). En esquema, payments.month es YYYY-MM string
  // calculado del lado del cliente — para evitar drift de timezone, usamos
  // la fecha del servidor (UTC) pero ajustamos manualmente a UY si hace falta.
  // En la práctica, las migraciones siempre han usado UTC.toISOString().slice(0,7).
  const now = new Date();
  const monthIso = now.toISOString().slice(0, 7); // YYYY-MM
  const monthNum = now.getUTCMonth();
  const monthLabel = MONTH_LABELS[monthNum];
  const dayOfMonth = now.getUTCDate();

  const [{ data: paymentRow }, { data: clientRow }] = await Promise.all([
    admin
      .from("payments")
      .select("status, paid_date")
      .eq("client_id", clientId)
      .eq("month", monthIso)
      .maybeSingle(),
    admin
      .from("clients")
      .select("fee")
      .eq("id", clientId)
      .maybeSingle(),
  ]);

  const fee = clientRow?.fee ? Number(clientRow.fee) : null;
  const paymentStatus = (paymentRow?.status ?? "pending") as
    | "paid"
    | "pending"
    | "late";

  // Si está pagado, mostramos verde sin importar la fecha
  if (paymentStatus === "paid") {
    return Response.json({
      status: "paid",
      color: "green",
      label: `Pago de ${monthLabel} · al día`,
      daysToDue: 0,
      month: monthIso,
      monthLabel,
      fee,
    });
  }

  // No pagado — calculamos semáforo por fecha
  if (dayOfMonth < DUE_RANGE_START) {
    return Response.json({
      status: "pending",
      color: "neutral",
      label: `Próximo pago: ${DUE_RANGE_START}–${DUE_RANGE_END} ${monthLabel}`,
      daysToDue: DUE_RANGE_END - dayOfMonth,
      month: monthIso,
      monthLabel,
      fee,
    });
  }

  if (dayOfMonth >= DUE_RANGE_START && dayOfMonth <= DUE_RANGE_END) {
    const daysLeft = DUE_RANGE_END - dayOfMonth;
    return Response.json({
      status: "pending",
      color: "amber",
      label:
        daysLeft === 0
          ? "Vence hoy"
          : daysLeft === 1
            ? "Vence mañana"
            : `Vence en ${daysLeft} días`,
      daysToDue: daysLeft,
      month: monthIso,
      monthLabel,
      fee,
    });
  }

  // dayOfMonth > 9 — vencido
  const daysOverdue = dayOfMonth - DUE_RANGE_END;
  return Response.json({
    status: "pending",
    color: "red",
    label:
      daysOverdue === 1
        ? "Vencido hace 1 día"
        : `Vencido hace ${daysOverdue} días`,
    daysToDue: -daysOverdue,
    month: monthIso,
    monthLabel,
    fee,
  });
}
