// ==================== GERENCIAS — el organigrama en código (client-safe) ====================
// Mapa único de las 11 áreas del registry → las 6 gerencias del organigrama
// (vault/empresa/ + doc 15). Lo consumen: lib/digests.ts (server), las
// personas del consultor, EstadoEmpresa y la página /gerente (browser).
// Solo consts y tipos — sin imports de supabase ni server-only.

import type { AgentArea } from "@/lib/agent-registry";

export type GerenciaSlug =
  | "marketing"
  | "analitica"
  | "finanzas"
  | "operaciones"
  | "clientes"
  | "ventas";

export interface GerenciaDef {
  slug: GerenciaSlug;
  label: string;
  emoji: string;
  /** Áreas del registry que agrupa (doc 15). */
  areas: AgentArea[];
}

export const GERENCIAS: GerenciaDef[] = [
  {
    slug: "marketing",
    label: "Marketing y Contenido",
    emoji: "📣",
    areas: ["growth", "contenido", "paid-media"],
  },
  { slug: "analitica", label: "Analítica", emoji: "📊", areas: ["analytics"] },
  { slug: "finanzas", label: "Finanzas", emoji: "💰", areas: ["finanzas"] },
  {
    slug: "operaciones",
    label: "Operaciones",
    emoji: "⚙️",
    areas: ["ops", "plataforma", "ecommerce-ops"],
  },
  {
    slug: "clientes",
    label: "Clientes",
    emoji: "🤝",
    areas: ["client-success", "onboarding"],
  },
  { slug: "ventas", label: "Ventas", emoji: "📈", areas: ["ventas"] },
];

export function gerenciaDe(area: AgentArea): GerenciaDef | undefined {
  return GERENCIAS.find((g) => g.areas.includes(area));
}

/** Gerencias que un rol puede leer (mismo gating que la RLS de `digests`). */
export function gerenciasVisibles(role: "director" | "team"): GerenciaDef[] {
  if (role === "director") return GERENCIAS;
  return GERENCIAS.filter((g) => g.slug !== "finanzas" && g.slug !== "ventas");
}

/**
 * Personas del consultor global (migs 095 + 097). El tipo vive acá
 * (client-safe) para que widget/página lo usen sin importar código
 * server-only; consultant-personas.ts (server) lo re-exporta. Cada
 * gerencia del organigrama tiene su gerente conversacional + el general.
 * OJO: agregar un valor acá exige extender el CHECK de la mig 097.
 */
export type PersonaId = "general" | GerenciaSlug;

/** Orden canónico de chips: el general primero, después el organigrama. */
export const PERSONA_IDS: PersonaId[] = [
  "general",
  ...GERENCIAS.map((g) => g.slug),
];

/** Labels completos (headers/títulos). */
export const PERSONA_LABEL: Record<PersonaId, string> = {
  general: "Gerente General",
  marketing: "Gerente de Marketing",
  analitica: "Gerente de Analítica",
  finanzas: "Gerente de Finanzas",
  operaciones: "Gerente de Operaciones",
  clientes: "Gerente de Clientes",
  ventas: "Gerente de Ventas",
};

/** Labels cortos para chips (7 chips tienen que entrar en 2 filas). */
export const PERSONA_SHORT: Record<PersonaId, string> = {
  general: "General",
  marketing: "Marketing",
  analitica: "Analítica",
  finanzas: "Finanzas",
  operaciones: "Operaciones",
  clientes: "Clientes",
  ventas: "Ventas",
};

export const PERSONA_EMOJI: Record<PersonaId, string> = {
  general: "🎩",
  marketing: "📣",
  analitica: "📊",
  finanzas: "💰",
  operaciones: "⚙️",
  clientes: "🤝",
  ventas: "📈",
};

/**
 * Personas que un rol puede usar (espejo de gerenciasVisibles + el gate
 * server-side de allowedRoles en consultant-personas.ts).
 */
export function personasVisibles(role: "director" | "team"): PersonaId[] {
  if (role === "director") return PERSONA_IDS;
  return PERSONA_IDS.filter((p) => p !== "finanzas" && p !== "ventas");
}

/**
 * Con qué persona se abre el chat al llegar desde la card de una gerencia.
 * 1:1 desde la mig 097; finanzas/ventas son de directores — para team caen
 * al Gerente General (que igual no recibe esos digests por RLS).
 */
export function personaForGerencia(
  slug: string | null,
  role: "director" | "team",
): PersonaId {
  const g = GERENCIAS.find((x) => x.slug === slug);
  if (!g) return "general";
  if ((g.slug === "finanzas" || g.slug === "ventas") && role !== "director") {
    return "general";
  }
  return g.slug;
}
