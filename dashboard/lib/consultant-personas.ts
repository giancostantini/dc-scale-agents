// ==================== PERSONAS DEL CONSULTOR GLOBAL (H2 piloto) — SERVER ONLY ====================
// El mismo motor (route /api/consultant/global) atiende como tres personas.
// Cada persona define: quién puede usarla, qué tools tiene, qué agentes puede
// dispatchar y qué contexto EXTRA se inyecta a su system prompt.
//
// Limitación conocida del route (deuda declarada): las tools son single-turn
// — el resultado NO vuelve al modelo. Por eso el Gerente de Finanzas NO tiene
// un tool de "consultar números": los números se le inyectan al system ANTES
// de responder (sino sería teatro: respondería sin verlos).
//
// Regla dura transversal: ninguna persona ejecuta dinero ni saltea gates.

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AGENT_REGISTRY, dispatchableAgentKeys } from "@/lib/agent-registry";
import {
  currentMonthUY,
  posicionPorMoneda,
  proyeccionDelMes,
  descalceResumen,
} from "@/lib/tesoreria";

export type PersonaId = "general" | "finanzas" | "marketing";

export interface PersonaConfig {
  id: PersonaId;
  /** Nombre visible (subtítulo del widget). */
  name: string;
  allowedRoles: Array<"director" | "team">;
  /** Tools habilitadas para esta persona. */
  tools: {
    runAgent: boolean;
    saveMemory: boolean;
    processStatus: boolean;
  };
  /** Si runAgent=true: subset de agentes dispatchables (undefined = todos). */
  allowedAgentKeys?: string[];
  /** Bloque de identidad que se SUMA al prompt base (cacheable). */
  systemExtra?: string;
  /** Contexto vivo inyectado al system en cada turno (no cacheable). */
  loadExtraContext?: () => Promise<string | null>;
}

/** Agentes de la Gerencia de Marketing y Contenido (registry = fuente). */
function marketingAgentKeys(): string[] {
  const areas = new Set(["growth", "contenido", "paid-media"]);
  const dispatchable = new Set(dispatchableAgentKeys());
  return AGENT_REGISTRY.filter(
    (e) => dispatchable.has(e.key) && areas.has(e.area),
  ).map((e) => e.key);
}

// ---------------------------------------------------------------------------
// Contexto financiero (Gerente de Finanzas)
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

const fmt = (n: number) => Math.round(n).toLocaleString("es-UY");

/**
 * Snapshot financiero determinista para el system prompt: posición por
 * moneda, TC, proyección del mes, facturas abiertas, último cierre y gasto
 * de IA del mes. Queries baratas, cero llamadas a Claude.
 */
async function loadFinanceContext(): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const month = currentMonthUY();

  const [
    { data: cuentas },
    { data: rates },
    { data: clients },
    { data: schedules },
    { data: revenues },
    { data: expenses },
    { data: openPayments },
    { data: lastClose },
  ] = await Promise.all([
    admin.from("cuentas_bancarias").select("currency, current_balance, is_active"),
    admin
      .from("exchange_rates")
      .select("rate_date, usd_uyu_mid")
      .order("rate_date", { ascending: false })
      .limit(1),
    admin.from("clients").select("id, name, fee, fee_currency, status"),
    admin.from("client_fee_schedules").select("client_id, start_month, end_month, amount"),
    admin
      .from("manual_revenues")
      .select("kind, amount, currency, start_date, end_date, date, status"),
    admin
      .from("expenses")
      .select("date, amount, currency, recurrence, recurrence_end_date, status"),
    admin
      .from("payments")
      .select("client_id, month, status, amount_override")
      .in("status", ["pending", "late"]),
    admin
      .from("monthly_closes")
      .select("month, status, narrative_md, data")
      .order("month", { ascending: false })
      .limit(1),
  ]);

  const rate = rates?.[0] ? num(rates[0].usd_uyu_mid) : null;
  const posicion = posicionPorMoneda(cuentas ?? []);
  const proyeccion = proyeccionDelMes({
    month,
    clients: clients ?? [],
    feeSchedules: schedules ?? [],
    revenues: revenues ?? [],
    expenses: expenses ?? [],
    rate,
  });

  const nameById = new Map((clients ?? []).map((c) => [c.id, c.name as string]));
  const impagas = (openPayments ?? [])
    .map((p) => `${nameById.get(p.client_id) ?? p.client_id} · ${p.month} (${p.status})`)
    .slice(0, 12);

  const close = lastClose?.[0] ?? null;

  const lines = [
    "CONTEXTO FINANCIERO REAL (calculado ahora, fuentes: Supabase — NO estimes nada fuera de esto):",
    `- TC USD/UYU: ${rate ? fmt(rate) : "sin cargar"}${rates?.[0] ? ` (${rates[0].rate_date})` : ""}`,
    `- Posición en cuentas activas: USD ${fmt(posicion.USD ?? 0)} · UYU ${fmt(posicion.UYU ?? 0)}`,
    `- Proyección ${month}: USD ingresos ${fmt(proyeccion.flujo.USD.ingresos)} / egresos ${fmt(proyeccion.flujo.USD.egresos)} / neto ${fmt(proyeccion.flujo.USD.neto)} · UYU ingresos ${fmt(proyeccion.flujo.UYU.ingresos)} / egresos ${fmt(proyeccion.flujo.UYU.egresos)} / neto ${fmt(proyeccion.flujo.UYU.neto)}`,
    proyeccion.descalces.length > 0
      ? `- ⚠ DESCALCE: ${proyeccion.descalces.map((d) => descalceResumen(d, month)).join(" · ")}`
      : "- Sin descalce de moneda este mes.",
    impagas.length > 0
      ? `- Facturas abiertas (${impagas.length}): ${impagas.join(" · ")}`
      : "- Sin facturas abiertas.",
    close
      ? `- Último cierre: ${close.month} (${close.status}).${close.narrative_md ? ` Lectura: ${(close.narrative_md as string).slice(0, 600)}` : ""}`
      : "- Sin cierres generados todavía.",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Registro de personas
// ---------------------------------------------------------------------------

const PERSONAS: Record<PersonaId, PersonaConfig> = {
  general: {
    id: "general",
    name: "Gerente General",
    allowedRoles: ["director", "team"],
    tools: { runAgent: true, saveMemory: true, processStatus: true },
    // Comportamiento actual exacto: sin extra.
  },
  finanzas: {
    id: "finanzas",
    name: "Gerente de Finanzas",
    allowedRoles: ["director"],
    tools: { runAgent: false, saveMemory: true, processStatus: true },
    systemExtra: `PERSONA ACTIVA: GERENTE DE FINANZAS (piloto H2).
Sos el gerente de Finanzas de D&C Scale hablando con un director. Reglas duras:
- SOLO LECTURA Y RECOMENDACIÓN: jamás ejecutás pagos, conversiones, emisiones ni tocás presupuestos. Si te piden ejecutar algo de dinero, explicá dónde se hace a mano (dashboard /finanzas) — el dinero es SIEMPRE humano.
- Tus números son ÚNICAMENTE los del bloque CONTEXTO FINANCIERO REAL — si un dato no está ahí, decí que no lo tenés a mano y dónde verlo (/finanzas). No estimes.
- Foco: descalce de moneda, cobranzas atrasadas, desvíos vs mes anterior, y qué decisión conviene tomar esta semana. Directo, sin jerga.
- No tenés run_agent: no dispatchás agentes. Podés consultar estado de procesos y guardar memoria.`,
    loadExtraContext: loadFinanceContext,
  },
  marketing: {
    id: "marketing",
    name: "Gerente de Marketing",
    allowedRoles: ["director", "team"],
    tools: { runAgent: true, saveMemory: true, processStatus: true },
    allowedAgentKeys: marketingAgentKeys(),
    systemExtra: `PERSONA ACTIVA: GERENTE DE MARKETING Y CONTENIDO (piloto H2).
Sos el gerente del área Marketing y Contenido. Reglas:
- Tu flota dispatchable es SOLO la del área (creative-assistant, content-strategy, seo) — para otras áreas, derivá al Gerente General.
- Antes de arrancar un ciclo de contenido, consultá get_process_status: si está en "calendario" dispatchá content-strategy; si está en "aprobacion_piezas", lo que falta es que aprueben — no dupliques trabajo.
- Nada de lo que dispatchás llega al cliente sin gate humano; decilo cuando corresponda.
- Presupuestos de pauta: podés recomendar, JAMÁS ejecutar (el push es humano).`,
  },
};

export function getPersona(id: string | undefined | null): PersonaConfig | null {
  if (!id) return PERSONAS.general;
  return (PERSONAS as Record<string, PersonaConfig>)[id] ?? null;
}

export const PERSONA_IDS: PersonaId[] = ["general", "finanzas", "marketing"];
