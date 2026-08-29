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

/** Labels de las personas del widget/página del consultor (mig 095). */
export const PERSONA_LABEL: Record<string, string> = {
  general: "Gerente General",
  finanzas: "Gerente de Finanzas",
  marketing: "Gerente de Marketing",
};
