/**
 * POST /api/finanzas/auto-distribute
 *
 * Genera (o regenera) snapshots de distribución de dividendos para
 * los meses cerrados que aún no tengan uno. Idempotente: si un
 * snapshot ya existe, no lo toca.
 *
 * Para meses sin actividad (sin payments paid, expenses ni manual
 * revenues paid) tampoco crea snapshot — no tiene sentido.
 *
 * Pensado para invocar:
 *   · Manualmente desde un job (cron en Vercel/Supabase).
 *   · O dejarlo como fallback al lazy-generation que hace el UI.
 *
 * Requiere CRON_SECRET en el header `x-cron-secret` si la env var
 * está configurada (para no exponerlo público). Si no hay secret,
 * permite solo desde director autenticado.
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { distributeMonthByClient } from "@/lib/finanzas";
import type { ClientDividendDistribution } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DividendConfigRow {
  partner_a_pct: number | string;
  partner_b_pct: number | string;
  inversiones_pct: number | string;
  back_pct: number | string;
  partner_a_name: string;
  partner_b_name: string;
}

interface PaymentRow {
  client_id: string;
  month: string;
  status: string;
  amount_override: number | string | null;
}

interface ExpenseRow {
  date: string;
  amount: number | string;
  assigned_to: string;
}

interface ManualRevRow {
  status: string | null;
  amount: number | string;
  date: string;
  recurrence: string | null;
  end_date: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  fee: number | string;
  dividend_distribution: ClientDividendDistribution | null;
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;

  if (!url || !serviceKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  // Auth: si hay CRON_SECRET, exigir el header. Si no, exigir
  // token de director.
  const providedSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    if (providedSecret !== cronSecret) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!callerToken) {
      return Response.json({ error: "Sin sesión" }, { status: 401 });
    }
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) {
      return Response.json({ error: "No autenticado" }, { status: 401 });
    }
    const { data: profile } = await caller
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.role !== "director") {
      return Response.json({ error: "Solo directores" }, { status: 403 });
    }
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Config actual
  const { data: cfg, error: cfgErr } = await admin
    .from("dividend_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (cfgErr || !cfg) {
    return Response.json(
      { error: "No se pudo leer dividend_config.", detail: cfgErr?.message },
      { status: 500 },
    );
  }
  const config = cfg as DividendConfigRow;
  const configForDist = {
    id: 1,
    partner_a_pct: Number(config.partner_a_pct),
    partner_b_pct: Number(config.partner_b_pct),
    inversiones_pct: Number(config.inversiones_pct),
    back_pct: Number(config.back_pct),
    partner_a_name: config.partner_a_name,
    partner_b_name: config.partner_b_name,
    updated_at: "",
    updated_by: null,
  };

  // 2. Snapshots existentes
  const { data: existing } = await admin
    .from("dividend_distributions")
    .select("month_key");
  const existingSet = new Set(
    (existing ?? []).map((r) => (r as { month_key: string }).month_key),
  );

  // 3. Range: desde el primer mes con actividad hasta el mes anterior
  // al actual (no incluimos el mes en curso).
  const [{ data: clients }, { data: payments }, { data: expenses }, { data: manualRevs }] =
    await Promise.all([
      admin.from("clients").select("id, name, fee, dividend_distribution"),
      admin.from("payments").select("client_id, month, status, amount_override"),
      admin.from("expenses").select("date, amount, assigned_to"),
      admin.from("manual_revenues").select("status, amount, date, recurrence, end_date"),
    ]);

  const allClients = (clients ?? []) as ClientRow[];
  const allPayments = (payments ?? []) as PaymentRow[];
  const allExpenses = (expenses ?? []) as ExpenseRow[];
  const allManual = (manualRevs ?? []) as ManualRevRow[];

  // Determinar rango de meses con datos
  const allMonths = new Set<string>();
  for (const p of allPayments) allMonths.add(p.month);
  for (const e of allExpenses)
    if (e.date) allMonths.add(e.date.slice(0, 7));
  for (const r of allManual)
    if (r.date) allMonths.add(r.date.slice(0, 7));
  if (allMonths.size === 0) {
    return Response.json({ created: 0, skipped: 0, message: "Sin actividad para distribuir." });
  }
  const sortedMonths = Array.from(allMonths).sort();
  const from = sortedMonths[0];
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // último mes cerrado = mes anterior al actual
  const [cy, cm] = currentMonth.split("-").map(Number);
  const prevDate = new Date(cy, cm - 2, 1);
  const to = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  if (to < from) {
    return Response.json({ created: 0, skipped: 0, message: "Sin meses cerrados todavía." });
  }
  const months = monthsBetween(from, to);

  // 4. Para cada mes faltante con actividad, computar net y persistir
  let created = 0;
  let skipped = 0;
  for (const mk of months) {
    if (existingSet.has(mk)) {
      skipped++;
      continue;
    }
    // ¿Hay actividad real en este mes?
    const hasPayment = allPayments.some(
      (p) => p.month === mk && p.status === "paid",
    );
    const hasExpense = allExpenses.some((e) => (e.date ?? "").startsWith(mk));
    const hasManual = allManual.some(
      (r) =>
        (r.status ?? "paid") === "paid" &&
        Number(r.amount) > 0 &&
        (r.date ?? "").startsWith(mk),
    );
    if (!hasPayment && !hasExpense && !hasManual) {
      skipped++;
      continue;
    }
    // Split PER-CLIENT: cada cliente aplica su dividend_distribution
    // al net que aportó (fees_paid - expenses_asignados). El neto no
    // asignado (revenues sueltos, gastos corporativos) usa el split
    // global. Ver distributeMonthByClient en lib/finanzas.ts.
    const monthPayments = allPayments.filter(
      (p) => p.month === mk && p.status === "paid",
    );
    const monthExpenses = allExpenses.filter((e) =>
      (e.date ?? "").startsWith(mk),
    );
    const manualPaid = allManual
      .filter(
        (r) =>
          (r.status ?? "paid") === "paid" && (r.date ?? "").startsWith(mk),
      )
      .reduce((s, r) => s + Number(r.amount), 0);
    const totals = distributeMonthByClient({
      clients: allClients.map((c) => ({
        id: c.id,
        name: c.name,
        fee: Number(c.fee),
        dividend_distribution: c.dividend_distribution,
      })),
      clientPayments: monthPayments.map((p) => ({
        clientId: p.client_id,
        status: p.status,
        amountOverride:
          p.amount_override != null ? Number(p.amount_override) : null,
      })),
      monthExpenses: monthExpenses.map((e) => ({
        assignedTo: e.assigned_to,
        amount: Number(e.amount),
      })),
      unassignedRevenue: manualPaid,
      config: configForDist,
    });
    const { error: upErr } = await admin
      .from("dividend_distributions")
      .upsert(
        {
          month_key: mk,
          net_profit: totals.net,
          partner_a_pct: configForDist.partner_a_pct,
          partner_b_pct: configForDist.partner_b_pct,
          inversiones_pct: configForDist.inversiones_pct,
          back_pct: configForDist.back_pct,
          partner_a_amount: totals.partnerA,
          partner_b_amount: totals.partnerB,
          inversiones_amount: totals.inversiones,
          back_amount: totals.back,
          auto_generated: true,
          notes: "auto-distribute endpoint (per-client splits)",
        },
        { onConflict: "month_key" },
      );
    if (upErr) {
      console.error("auto-distribute upsert error:", upErr);
    } else {
      created++;
    }
  }

  return Response.json({ created, skipped, total: months.length });
}
