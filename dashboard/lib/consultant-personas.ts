// ==================== PERSONAS DEL CONSULTOR GLOBAL (H2 piloto) — SERVER ONLY ====================
// El mismo motor (route /api/consultant/global) atiende como tres personas.
// Cada persona define: quién puede usarla, qué tools tiene, qué agentes puede
// dispatchar y qué contexto EXTRA se inyecta a su system prompt.
//
// Limitación conocida del route (deuda declarada): las tools son single-turn
// — el resultado NO vuelve al modelo. Por eso el contexto de cada gerente se
// INYECTA al system ANTES de responder (sino sería teatro: respondería sin
// verlo). El Gerente General recibe los digests de las 6 gerencias (mig 096:
// pipeline proyecto → área → GG); cada gerente de área recibe el suyo;
// Finanzas recibe además el snapshot vivo de tesorería.
//
// Regla dura transversal: ninguna persona ejecuta dinero ni saltea gates.

import { AGENT_REGISTRY, dispatchableAgentKeys } from "@/lib/agent-registry";
import { GERENCIAS } from "@/lib/gerencias";
import { loadFinanceContext } from "@/lib/finance-context";
import { loadGerenciasBlock, loadAreaDigestBlock } from "@/lib/digests";
import type { CallerContext } from "@/lib/consultant-global-context";

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
  /**
   * Contexto vivo inyectado al system en cada turno. Recibe el caller para
   * filtrar por rol (ej. team no ve digests de finanzas/ventas).
   */
  loadExtraContext?: (caller: CallerContext) => Promise<string | null>;
  /**
   * true = el bloque extra cambia lento (digests diarios) → cache_control
   * ephemeral. false/undefined = snapshot vivo por turno, sin cache.
   */
  cacheExtraContext?: boolean;
}

/** Agentes de la Gerencia de Marketing y Contenido (registry + organigrama). */
function marketingAgentKeys(): string[] {
  const areas = new Set<string>(
    GERENCIAS.find((g) => g.slug === "marketing")?.areas ?? [],
  );
  const dispatchable = new Set(dispatchableAgentKeys());
  return AGENT_REGISTRY.filter(
    (e) => dispatchable.has(e.key) && areas.has(e.area),
  ).map((e) => e.key);
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
    systemExtra: `JERARQUÍA (mig 096): sos el GERENTE GENERAL. Cada cliente tiene un Gerente de Proyecto que prepara su estado a diario; cada gerencia (Marketing, Analítica, Finanzas, Operaciones, Clientes, Ventas) agrega los de sus clientes. Vas a recibir un bloque "ESTADO POR GERENCIA" con todo eso YA preparado: cuando te pregunten por un área o un cliente, respondé DESDE ese bloque — con datos, no con generalidades. Si el bloque no está o luce viejo, decilo. Los semáforos: 🔴 = hay errores o pagos atrasados, 🟡 = gates humanos o solicitudes esperando, 🟢 = en orden.`,
    loadExtraContext: (caller) => loadGerenciasBlock(caller),
    cacheExtraContext: true,
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
    // Snapshot vivo por turno (números frescos > cache).
    loadExtraContext: () => loadFinanceContext(),
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
- Vas a recibir el ESTADO PREPARADO DE TU GERENCIA (digest diario): ciclo de contenido por cliente + ganadores. Respondé desde ahí; para el detalle fino usá get_process_status.
- Antes de arrancar un ciclo de contenido, consultá get_process_status: si está en "calendario" dispatchá content-strategy; si está en "aprobacion_piezas", lo que falta es que aprueben — no dupliques trabajo.
- Nada de lo que dispatchás llega al cliente sin gate humano; decilo cuando corresponda.
- Presupuestos de pauta: podés recomendar, JAMÁS ejecutar (el push es humano).`,
    loadExtraContext: () => loadAreaDigestBlock("marketing"),
    cacheExtraContext: true,
  },
};

export function getPersona(id: string | undefined | null): PersonaConfig | null {
  if (!id) return PERSONAS.general;
  return (PERSONAS as Record<string, PersonaConfig>)[id] ?? null;
}

export const PERSONA_IDS: PersonaId[] = ["general", "finanzas", "marketing"];
