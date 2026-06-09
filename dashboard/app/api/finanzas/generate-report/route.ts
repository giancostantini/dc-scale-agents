/**
 * POST /api/finanzas/generate-report
 *
 * Genera reportes financieros con IA basados en toda la data del
 * negocio (clientes, fees efectivos por tramos, payments, expenses,
 * manual revenues, leads).
 *
 * Body:
 *   reportKey: string  // identificador del tipo de reporte
 *   instructions?: string  // overrides / contexto extra del director
 *   periodFrom?: string  // YYYY-MM
 *   periodTo?: string    // YYYY-MM
 *
 * Solo director.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL_OPUS } from "@/lib/anthropic-model";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

/**
 * Catálogo canónico de reportes. Cada uno tiene su brief para el
 * agente — keys deben matchear con las del frontend.
 */
const REPORT_BRIEFS: Record<
  string,
  { title: string; brief: string }
> = {
  balance_general: {
    title: "Balance General",
    brief: `Generá el Balance General (estado de situación financiera) a la fecha del período seleccionado. Estructura: ACTIVOS (corrientes: caja, cuentas por cobrar / no corrientes), PASIVOS (corrientes: cuentas por pagar / no corrientes), PATRIMONIO NETO. Cuadrá las cifras: total activos = total pasivos + patrimonio neto. Si falta data para alguna línea (ej. capital social), marcalo "⚠ Falta info: ...".`,
  },
  estado_resultados: {
    title: "Estado de Resultados",
    brief: `Generá el Estado de Resultados (P&L) del período. Estructura: INGRESOS (fees cobrados + ingresos manuales), COSTOS DIRECTOS, MARGEN BRUTO, GASTOS OPERATIVOS (por categoría: funcionales, tools, IA, producción, impuestos, mkt interno, otros), RESULTADO OPERATIVO, OTROS INGRESOS/EGRESOS, RESULTADO NETO. Mostrá % sobre ingresos en cada línea relevante.`,
  },
  flujo_caja: {
    title: "Flujo de Caja",
    brief: `Generá el Flujo de Caja del período. Estructura: CASH INICIAL, ENTRADAS (cobros de fees + ingresos manuales) mes por mes, SALIDAS (egresos por mes), VARIACIÓN NETA mensual, CASH FINAL. Identificá meses con cash negativo o stress de caja.`,
  },
  evolucion_ingresos: {
    title: "Evolución de Ingresos",
    brief: `Analizá la evolución de ingresos a lo largo del período. Mostrá por mes: ingresos cobrados totales, MRR efectivo (con tramos del calendario de pago), ingresos manuales. Calculá crecimiento MoM y trend. Top 5 clientes que más aportan + concentración.`,
  },
  evolucion_gastos: {
    title: "Evolución de Gastos",
    brief: `Analizá evolución de gastos a lo largo del período. Mostrá por mes: total gastos, % sobre ingresos (cost ratio). Desglosá por categoría (funcionales, tools, IA, producción, impuestos, mkt interno, otros). Identificá outliers o picos.`,
  },
  cuentas_por_cobrar: {
    title: "Cuentas por Cobrar",
    brief: `Listá todos los cobros pendientes (payments con status != 'paid') por cliente. Para cada uno: cliente, mes facturado, monto, días de mora (si vencido). Ordená de más antiguo a más reciente. Total pendiente al final.`,
  },
  cuentas_por_pagar: {
    title: "Cuentas por Pagar",
    brief: `Listá compromisos pendientes (egresos fijos mensuales: 'monthly_fixed' + funcionales del equipo con su payment_day próximo). Mostrá: concepto, vencimiento, monto, categoría. Total a pagar próximos 30 días.`,
  },
  libro_diario: {
    title: "Libro Diario",
    brief: `Generá el Libro Diario del período: todos los movimientos en orden cronológico, cada uno con fecha, concepto, debe, haber, observaciones. Incluí: ingresos cobrados (debe Caja / haber Ingresos), egresos (debe Gasto X / haber Caja), facturación (debe Cuentas por Cobrar / haber Ingresos).`,
  },
  libro_mayor: {
    title: "Libro Mayor",
    brief: `Generá el Libro Mayor agrupando movimientos por cuenta contable: Caja, Cuentas por Cobrar, Cuentas por Pagar, Ingresos por servicios, Gastos por categoría, etc. Para cada cuenta: saldo inicial, movimientos del período, saldo final.`,
  },
  iva_ventas: {
    title: "IVA Ventas",
    brief: `Resumen de IVA débito fiscal (ventas) del período. Para cada cobro: cliente, mes, monto neto, alícuota (22% Uruguay), IVA débito, total. Subtotales por mes. Total general del período.`,
  },
  iva_compras: {
    title: "IVA Compras",
    brief: `Resumen de IVA crédito fiscal (compras) del período. Para cada gasto: proveedor/concepto, fecha, monto neto, alícuota, IVA crédito, total. Subtotales por mes. Total general. Balance IVA débito − crédito al final.`,
  },
  impuesto_renta: {
    title: "Impuesto a la Renta",
    brief: `Cálculo aproximado del Impuesto a la Renta del período. Estructura: RESULTADO NETO contable, ajustes fiscales (gastos no deducibles, ingresos exentos), RESULTADO IMPONIBLE, alícuota corporativa (Uruguay IRAE 25%), IMPUESTO CALCULADO, anticipos ya pagados, saldo a pagar/favor.`,
  },
  retenciones: {
    title: "Retenciones",
    brief: `Resumen de retenciones del período (sufridas + practicadas). Para cada una: contraparte, concepto, fecha, monto base, alícuota, retención. Subtotal sufridas (recupero) + practicadas (a depositar). Si no hay data específica, decílo "⚠ Falta info".`,
  },
  percepciones: {
    title: "Percepciones",
    brief: `Resumen de percepciones del período. Estructura similar a retenciones pero del lado de las percepciones aplicadas/sufridas. Si no hay módulo de percepciones todavía, dejá "⚠ Falta info — módulo no implementado".`,
  },
  facturacion_por_cliente: {
    title: "Facturación por Cliente",
    brief: `Detalle de facturación agrupada por cliente. Para cada uno: nombre, sector, fee del contrato, monto efectivo (con tramos del calendario), total facturado del período, total cobrado, % cobranza, status. Ordenar por monto descendente. Total general.`,
  },
  facturacion_por_servicio: {
    title: "Facturación por Producto/Servicio",
    brief: `Detalle de facturación por categoría de servicio. Como no hay todavía un módulo de productos/servicios separado, agrupá por tipo de cliente (Growth Partner vs Desarrollo) y mostrá: ingresos, cantidad de clientes, ticket promedio.`,
  },
  gastos_por_categoria: {
    title: "Gastos por Categoría",
    brief: `Análisis de gastos por categoría del período: funcionales, tools, IA, producción, impuestos, mkt interno, otros. Para cada una: total, % del total de gastos, evolución mes a mes (tabla), top items específicos.`,
  },
  comparativo_periodos: {
    title: "Comparativo Períodos",
    brief: `Comparación side-by-side del período actual vs período anterior. Métricas: ingresos, gastos, neto, margen %, MRR, clientes activos, churn. Variación % en cada métrica. Insights sobre mejoras/empeoramientos.`,
  },
  presupuesto_vs_real: {
    title: "Presupuesto vs Real",
    brief: `Comparación presupuesto vs ejecutado del período. Como no tenemos un módulo de budget formal todavía, asumí objetivo de 60% margen neto y proyecciones simples. Mostrá: línea presupuestada, real, variación absoluta y %, semáforo (verde dentro de target, amarillo desvío leve, rojo desvío crítico).`,
  },
};

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!url || !anonKey || !serviceKey || !anthropicKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  // Auth director
  const callerToken = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) return Response.json({ error: "No autenticado" }, { status: 401 });
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json({ error: "Solo directores." }, { status: 403 });
  }

  let body: {
    reportKey?: string;
    instructions?: string;
    periodFrom?: string;
    periodTo?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const reportKey = body.reportKey;
  if (!reportKey || !REPORT_BRIEFS[reportKey]) {
    return Response.json(
      { error: "reportKey inválido o faltante" },
      { status: 400 },
    );
  }
  const report = REPORT_BRIEFS[reportKey];
  const periodFrom = body.periodFrom ?? defaultPeriodFrom();
  const periodTo = body.periodTo ?? new Date().toISOString().slice(0, 7);

  // Cargar TODA la data financiera del período
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [clients, payments, expenses, schedules, manualRevs] =
    await Promise.all([
      admin.from("clients").select("id, name, sector, type, fee, country"),
      admin
        .from("payments")
        .select("client_id, month, status, amount_override, note")
        .gte("month", periodFrom)
        .lte("month", periodTo),
      admin
        .from("expenses")
        .select(
          "id, date, concept, category, assigned_to, amount, recurrence, recurrence_end_date, mkt_budget_client_id",
        )
        .gte("date", `${periodFrom}-01`)
        .lte("date", `${periodTo}-31`),
      admin
        .from("client_fee_schedules")
        .select("id, client_id, start_month, end_month, amount, currency, notes"),
      admin
        .from("manual_revenues")
        .select("kind, description, amount, currency, start_date, end_date, date, category, client_id"),
    ]);

  const dataBlock = `PERÍODO: ${periodFrom} → ${periodTo}

CLIENTES:
${JSON.stringify(clients.data ?? [], null, 2)}

CALENDARIO DE PAGO (tramos por cliente):
${JSON.stringify(schedules.data ?? [], null, 2)}

PAYMENTS (cobros del período):
${JSON.stringify(payments.data ?? [], null, 2)}

EXPENSES (egresos del período):
${JSON.stringify(expenses.data ?? [], null, 2)}

INGRESOS MANUALES (vigentes en el período):
${JSON.stringify(manualRevs.data ?? [], null, 2)}`;

  const systemPrompt = `Sos el Agente de Reportes Financieros de Dearmas Costantini.
Generás reportes contables y financieros para uso interno del director,
en español rioplatense, con voz directa y formato markdown limpio.

REGLAS:
- Empezás SIEMPRE con un H1 que es el título del reporte.
- Usás tablas markdown para datos tabulares.
- Cifras en USD por default. Formato US$ 1.500 (no $1,500).
- Si una sección no se puede completar por falta de info, marcá
  "⚠ Falta info: [qué pregunta hay que responder]" en vez de inventar.
- Calculá totales y subtotales explícitos.
- Cerrá con un block "**Observaciones del agente**" con 2-3 insights
  relevantes (no obvios) sobre el reporte.

PRECEDENCIA EN CÁLCULO DE FEES (importante):
1. payment.amount_override (override puntual del mes)
2. effectiveFeeForMonth via client_fee_schedules (tramo del calendario:
   start_month <= mes <= end_month o end_month=null)
3. client.fee (contrato base como último fallback)`;

  const userPrompt = `Generá el reporte "${report.title}".

INSTRUCCIONES PARA ESTE REPORTE:
${report.brief}

${body.instructions ? `INSTRUCCIONES EXTRA DEL DIRECTOR:\n${body.instructions}\n` : ""}

DATA DEL NEGOCIO:
${dataBlock}

Output: SOLO el markdown del reporte. Sin preámbulo. Empezá con el H1 del título.`;

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL_OPUS,
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const reply =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    return Response.json({
      success: true,
      reportKey,
      title: report.title,
      markdown: reply,
      period: { from: periodFrom, to: periodTo },
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    });
  } catch (err) {
    console.error("[generate-report] Claude error:", err);
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        {
          error: `Claude API · ${err.status ?? "?"}`,
          detail: err.message,
        },
        { status: err.status ?? 500 },
      );
    }
    const e = err as Error;
    return Response.json(
      { error: "Error inesperado.", detail: e.message },
      { status: 500 },
    );
  }
}

/** Default: primer día del año actual. */
function defaultPeriodFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-01`;
}
