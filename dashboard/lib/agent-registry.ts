/**
 * AGENT REGISTRY — fuente única de verdad de la flota (Stage 0 del roadmap,
 * docs/ai-company-audit/14-roadmap.md).
 *
 * Antes había 4 listas desalineadas: AGENT_CATALOG (lib/agents.ts),
 * DISPATCHABLE_AGENTS (/api/consultant), FAST_AGENTS (/api/agents/run) y los
 * workflows de GHA. Alta/baja de un agente tocaba 4 lugares y el drift era
 * silencioso (ej: el catálogo ofreció "content-creator" meses después de
 * eliminado). Desde ahora:
 *
 *   - El catálogo de UI se DERIVA de acá (agentCatalog()).
 *   - La lista de dispatch del consultor se DERIVA de acá (dispatchableAgentKeys()).
 *   - /api/agents/run VALIDA contra acá antes de abrir un run (getAgentEntry).
 *   - Los módulos fast-path (paths de import) siguen en /api/agents/run porque
 *     son detalle de implementación de Vercel, pero sus claves deben existir acá.
 *
 * Al agregar un agente nuevo: UNA entrada acá + (si corre por GHA) su workflow.
 * Los campos area/owner/status alimentan además los horizontes H2/H3
 * (docs/ai-company-audit/17-horizontes-evolucion.md): un coordinador de área
 * solo podrá orquestar la flota de SU área según este registry.
 */

export type AgentKind =
  /** Razona con LLM sobre contexto. */
  | "agent"
  /** Determinístico (ETL/scraper/scaffold) — sin juicio de modelo. */
  | "job"
  /** Interfaz conversacional (endpoint de chat del dashboard). */
  | "consultant";

export type AgentArea =
  | "growth"
  | "contenido"
  | "paid-media"
  | "analytics"
  | "client-success"
  | "onboarding"
  | "ops"
  | "plataforma"
  | "ecommerce-ops"
  | "finanzas"
  | "ventas";

export type AgentStatus =
  /** Con trigger automático activo (cron) o uso frecuente. */
  | "active"
  /** Cron comentado a propósito (costos jul 2026) — disponible on-demand. */
  | "paused"
  /** Operativo pero sin caso de uso en los clientes actuales. */
  | "dormant";

export interface AgentRegistryEntry {
  key: string;
  name: string;
  desc: string;
  kind: AgentKind;
  area: AgentArea;
  /** Owner humano del área (doc 15). */
  owner: "gian" | "fede" | "lucia" | "socios";
  status: AgentStatus;
  /** Archivo de workflow en .github/workflows, si corre por GHA. */
  workflow?: string;
  /** true si el workflow escucha repository_dispatch con type === key
   *  (requisito para dispararlo desde /api/agents/run). */
  repositoryDispatch?: boolean;
  /** Claves del fast-path in-process en /api/agents/run (si aplica). */
  fastKeys?: string[];
  /** Disponible para la tool run_agent de los consultores. */
  dispatchable?: boolean;
  /** Aparece como card en /cliente/[id]/agentes. */
  uiCatalog?: boolean;
  /** Gate por módulos del cliente (mismo contrato que AgentDef.moduleGate). */
  moduleGate?: "content" | "seo" | "analytics" | "ecommerce";
  /** Brief inicial que propone la card del catálogo. */
  defaultBrief?: Record<string, unknown>;
  /** Stage 4 — quiénes pueden disparar este agente (dispatch manual o vía
   *  consultores). Default: director y team. */
  dispatchRoles?: Array<"director" | "team">;
  /** Stage 4 — techo de gasto mensual en USD para este agente (suma de
   *  api_usage con source 'agent:<key>'). Al alcanzarlo, el dispatch se
   *  bloquea con error claro hasta el mes siguiente (o hasta subir el
   *  límite acá). Default: DEFAULT_AGENT_MONTHLY_LIMIT_USD. 0 = sin límite. */
  monthlyCostLimitUsd?: number;
}

/** Techo de gasto mensual por agente cuando la entry no define uno.
 *  Conservador a propósito: un agente que se descontrola se frena solo y
 *  el error dice exactamente dónde subir el límite. */
export const DEFAULT_AGENT_MONTHLY_LIMIT_USD = 25;

export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  // ============ GROWTH ============
  {
    key: "sector-trends",
    name: "Analista de Tendencias",
    desc: "Tendencias semanales del nicho por cliente GP (web search + fuentes). Alimenta interno, equipo y portal+mail.",
    kind: "agent",
    area: "growth",
    owner: "gian",
    status: "active",
    workflow: "sector-trends.yml",
  },
  {
    key: "client-research",
    name: "Investigador de Clientes",
    desc: "Investigación web del negocio del cliente al arrancar; escribe learning-log.",
    kind: "agent",
    area: "growth",
    owner: "gian",
    status: "paused",
    workflow: "client-research.yml",
    repositoryDispatch: true,
  },
  {
    key: "competitor-scanner",
    name: "Observador de Competencia",
    desc: "Sincroniza el banco de anuncios curado (competitors.md) a competitor_pieces.",
    kind: "job",
    area: "growth",
    owner: "gian",
    status: "active",
    workflow: "competitor-scanner.yml",
    repositoryDispatch: true,
  },

  // ============ CONTENIDO ============
  {
    key: "creative-assistant",
    name: "Asistente Creativo",
    desc: "Apoyo creativo de la CM: ideas trending, briefs de contenido, copy y dirección visual listos para que el equipo produzca.",
    kind: "agent",
    area: "contenido",
    owner: "lucia",
    status: "active",
    workflow: "creative-assistant.yml",
    repositoryDispatch: true,
    dispatchable: true,
    uiCatalog: true,
    moduleGate: "content",
    defaultBrief: { pieceType: "reel" },
  },
  {
    key: "content-strategy",
    name: "Estratega de Contenido",
    desc: "Calendario editorial semanal con briefs por pieza.",
    kind: "agent",
    area: "contenido",
    owner: "lucia",
    status: "paused",
    workflow: "content-strategy.yml",
    repositoryDispatch: true,
    dispatchable: true,
    uiCatalog: true,
    moduleGate: "content",
    defaultBrief: {},
  },
  {
    key: "seo",
    name: "Especialista SEO",
    desc: "Keyword research, blog posts, meta tags optimizados.",
    kind: "agent",
    area: "contenido",
    owner: "lucia",
    status: "paused",
    workflow: "seo-agent.yml",
    repositoryDispatch: true,
    dispatchable: true,
    uiCatalog: true,
    moduleGate: "seo",
    defaultBrief: { pieceType: "blog-post" },
  },

  // ============ ANALYTICS ============
  {
    key: "reporting-performance",
    name: "Analista de Performance",
    desc: "Reports diarios/semanales/mensuales + insights en lenguaje natural.",
    kind: "agent",
    area: "analytics",
    owner: "gian",
    status: "paused",
    workflow: "reporting-performance.yml",
    repositoryDispatch: true,
    fastKeys: ["reporting-performance:query", "reporting-performance:insights"],
    dispatchable: true,
    uiCatalog: true,
    moduleGate: "analytics",
    defaultBrief: { mode: "daily" },
  },
  {
    key: "social-media-metrics",
    name: "Medidor de Redes",
    desc: "Evalúa performance de piezas publicadas y alimenta el learning loop.",
    kind: "agent",
    area: "analytics",
    owner: "gian",
    status: "dormant", // sin ingestion automática de métricas todavía (gap #3 de la auditoría)
    workflow: "social-media-metrics.yml",
    repositoryDispatch: true,
    dispatchable: true,
    uiCatalog: true,
    moduleGate: "content",
    defaultBrief: { mode: "daily" },
  },
  {
    key: "insights-aggregator",
    name: "Agregador de Insights",
    desc: "Recalcula content_insights (hooks/formatos/ángulos ganadores) desde métricas. Determinístico.",
    kind: "job",
    area: "analytics",
    owner: "gian",
    status: "active",
    workflow: "insights-aggregator.yml",
    repositoryDispatch: true,
  },

  // ============ OPS / ECOMMERCE POR CLIENTE ============
  {
    key: "morning-briefing",
    name: "Briefing Matutino",
    desc: "Resumen del día por cliente o por usuario del equipo.",
    kind: "agent",
    area: "ops",
    owner: "socios",
    status: "paused",
    workflow: "morning-briefing.yml",
    repositoryDispatch: true,
    fastKeys: ["morning-briefing"],
    dispatchable: true,
    // uiCatalog: false — se muestra como panel del día en el dashboard del
    // cliente (servido vía /api/clients/[id]/briefing/latest), no como card.
  },
  {
    key: "stock",
    name: "Control de Inventario",
    desc: "Status / forecast / alert de inventario.",
    kind: "agent",
    area: "ecommerce-ops",
    owner: "gian",
    status: "dormant",
    workflow: "stock.yml",
    repositoryDispatch: true,
    dispatchable: true,
    uiCatalog: true,
    moduleGate: "ecommerce",
    defaultBrief: { mode: "status" },
  },
  {
    key: "stock-web",
    name: "Escáner de Stock Web",
    desc: "Escanea la tienda pública (Fenicio) y reporta talles faltantes. Determinístico, diario.",
    kind: "job",
    area: "ecommerce-ops",
    owner: "gian",
    status: "active",
    workflow: "stock-web.yml",
    repositoryDispatch: true,
  },
  {
    key: "logistics",
    name: "Coordinador de Logística",
    desc: "Schedule / dispatch / optimize de envíos.",
    kind: "agent",
    area: "ecommerce-ops",
    owner: "gian",
    status: "dormant",
    workflow: "logistics.yml",
    repositoryDispatch: true,
    dispatchable: true,
    uiCatalog: true,
    moduleGate: "ecommerce",
    defaultBrief: { mode: "schedule" },
  },

  // ============ ONBOARDING ============
  {
    key: "brandbook-processor",
    name: "Procesador de Marca",
    desc: "Procesa el brandbook del wizard en 8 archivos brand/ (retry + validación de secciones).",
    kind: "agent",
    area: "onboarding",
    owner: "gian",
    status: "paused",
    workflow: "brandbook-processor.yml",
    repositoryDispatch: true,
  },
  {
    key: "client-bootstrap",
    name: "Alta Técnica de Clientes",
    desc: "Scaffold del vault del cliente desde templates. Determinístico.",
    kind: "job",
    area: "onboarding",
    owner: "gian",
    status: "paused",
    workflow: "client-bootstrap.yml",
    repositoryDispatch: true,
  },

  // ============ PLATAFORMA ============
  {
    key: "qr-review",
    name: "Generador de QR de Reseñas",
    desc: "QR de reseñas de Google + cartel imprimible para el local del cliente (CLI: scripts/qr-review).",
    kind: "job",
    area: "client-success",
    owner: "gian",
    status: "active",
  },
  {
    key: "evals",
    name: "Auditor de Calidad",
    desc: "Juez semanal (Haiku) de los 3 sets dorados contra rubrics versionadas (vault/agency/evals). Scores a eval_runs — 'evals verdes' es trigger de H2.",
    kind: "job",
    area: "plataforma",
    owner: "gian",
    status: "active",
    workflow: "evals.yml",
  },
  {
    key: "budget-recommendations",
    name: "Recomendador de Presupuesto",
    desc: "Recomendación semanal de presupuesto de ads desde paid_media_daily (Stage 6). SIEMPRE YELLOW: recomienda, jamás ejecuta — el push es humano.",
    kind: "job",
    area: "growth",
    owner: "gian",
    status: "active",
  },
  {
    key: "distill-learnings",
    name: "Destilador de Aprendizajes",
    desc: "Destila aprendizajes semanales de los chats+ratings a consultant_memory_v2 (Haiku, incremental).",
    kind: "agent",
    area: "plataforma",
    owner: "gian",
    status: "active",
    workflow: "distill-learnings.yml",
  },

  // ============ CONSULTORES (interfaces conversacionales) ============
  {
    key: "consultant-portal",
    name: "Asesor del Cliente (portal)",
    desc: "Consultor del cliente final: contexto filtrado, sin tools.",
    kind: "consultant",
    area: "client-success",
    owner: "lucia",
    status: "active",
  },
  {
    key: "consultant-client",
    name: "Gerente de Proyecto",
    desc: "Gerente embebido en un cliente: conoce su estado a fondo y despacha agentes vía run_agent. Su digest diario alimenta a las gerencias (mig 096).",
    kind: "consultant",
    area: "ops",
    owner: "socios",
    status: "active",
  },
  {
    key: "consultant-global",
    name: "Gerente General",
    desc: "Cabeza de la jerarquía: recibe los digests de las 6 gerencias preparados de antemano (mig 096) y responde con precisión; run_agent + save_memory, streaming.",
    kind: "consultant",
    area: "ops",
    owner: "socios",
    status: "active",
  },
  {
    key: "content-consultant",
    name: "Consultor de Contenido",
    desc: "Textos de placas/statics para la CM, con 👍/👎 que alimenta el aprendizaje.",
    kind: "consultant",
    area: "contenido",
    owner: "lucia",
    status: "active",
  },
];

// ============ Derivaciones (los ex-registries duplicados) ============

const BY_KEY = new Map(AGENT_REGISTRY.map((e) => [e.key, e]));

/** Entrada del registry por clave (undefined si no existe). */
export function getAgentEntry(key: string): AgentRegistryEntry | undefined {
  return BY_KEY.get(key);
}

/** Claves válidas para la tool run_agent de los consultores. */
export function dispatchableAgentKeys(): string[] {
  return AGENT_REGISTRY.filter((e) => e.dispatchable).map((e) => e.key);
}

/** Cards del catálogo /cliente/[id]/agentes (shape compatible con AgentDef). */
export function agentCatalog(): {
  key: string;
  name: string;
  desc: string;
  defaultBrief: Record<string, unknown>;
  moduleGate?: "content" | "seo" | "analytics" | "ecommerce";
}[] {
  return AGENT_REGISTRY.filter((e) => e.uiCatalog).map((e) => ({
    key: e.key,
    name: e.name,
    desc: e.desc,
    defaultBrief: e.defaultBrief ?? {},
    moduleGate: e.moduleGate,
  }));
}

/** ¿Se puede despachar por repository_dispatch a GHA? */
export function canRepositoryDispatch(key: string): boolean {
  return Boolean(BY_KEY.get(key)?.repositoryDispatch);
}

/** Claves ejecutables desde /api/agents/run (fast o GHA). */
export function runnableAgentKeys(): string[] {
  return AGENT_REGISTRY.filter(
    (e) => e.repositoryDispatch || (e.fastKeys?.length ?? 0) > 0,
  ).map((e) => e.key);
}
