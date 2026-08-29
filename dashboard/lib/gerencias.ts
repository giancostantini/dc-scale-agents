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
 * Personas del consultor global (mig 095). El tipo vive acá (client-safe)
 * para que widget/página lo usen sin importar código server-only;
 * consultant-personas.ts (server) lo re-exporta.
 */
export type PersonaId = "general" | "finanzas" | "marketing";

/** Labels de las personas del widget/página del consultor (mig 095). */
export const PERSONA_LABEL: Record<PersonaId, string> = {
  general: "Gerente General",
  finanzas: "Gerente de Finanzas",
  marketing: "Gerente de Marketing",
};

export const PERSONA_EMOJI: Record<PersonaId, string> = {
  general: "🎩",
  finanzas: "💰",
  marketing: "📣",
};

/**
 * Con qué persona se abre el chat al llegar desde la card de una gerencia.
 * Solo marketing y finanzas tienen persona propia (piloto H2); el resto
 * atiende el Gerente General con el digest del área ya inyectado.
 */
export function personaForGerencia(
  slug: string | null,
  role: "director" | "team",
): PersonaId {
  if (slug === "marketing") return "marketing";
  if (slug === "finanzas" && role === "director") return "finanzas";
  return "general";
}
