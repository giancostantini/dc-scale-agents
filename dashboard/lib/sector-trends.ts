/**
 * sector-trends.ts — lectura de tendencias para el dashboard INTERNO.
 *
 * El interno es una vista CONSOLIDADA general: junta las tendencias de TODOS
 * los clientes (reusa los `agent_outputs` per-cliente ya generados por el
 * agente sector-trends; no corre IA ni genera artefactos nuevos).
 *
 * Server-only (usa service role). El componente <SectorTrendsView /> (mismo que
 * el portal) renderiza cada `items[]`.
 */

import { getSupabaseAdmin } from "./supabase/server";
import type { TrendItem } from "@/components/SectorTrendsView";

export interface ClientTrends {
  client: string;
  name: string;
  sector: string | null;
  items: TrendItem[];
  generatedAt: string | null;
  /** Markdown completo (fallback de render si items viene vacío). */
  bodyMd: string | null;
}

interface TrendsStructured {
  items?: TrendItem[];
  generatedAt?: string;
}

/**
 * Consolidado: para cada cliente Growth Partner activo, su última corrida de
 * tendencias. Ordenado por nombre de cliente.
 */
export async function getLatestSectorTrendsByClient(): Promise<ClientTrends[]> {
  const admin = getSupabaseAdmin();

  const { data: clients } = await admin
    .from("clients")
    .select("id, name, sector")
    // Todos los clientes de marketing (GP), incluidos los que están en
    // onboarding (ej. WizTrip). Los DEV quedan afuera por type.
    .eq("type", "gp");

  if (!clients || clients.length === 0) return [];

  const ids = clients.map((c) => c.id as string);

  // Traemos las salidas recientes y nos quedamos con la más nueva por cliente.
  const { data: outputs } = await admin
    .from("agent_outputs")
    .select("client, structured, body_md, created_at")
    .eq("output_type", "sector-trends")
    .in("client", ids)
    .order("created_at", { ascending: false })
    .limit(300);

  const latestByClient = new Map<
    string,
    { structured: unknown; body_md: string | null; created_at: string }
  >();
  for (const o of outputs ?? []) {
    const key = o.client as string;
    if (!latestByClient.has(key)) {
      latestByClient.set(key, {
        structured: o.structured,
        body_md: (o.body_md as string | null) ?? null,
        created_at: o.created_at as string,
      });
    }
  }

  return clients
    .map((c) => {
      const o = latestByClient.get(c.id as string);
      const structured = (o?.structured ?? {}) as TrendsStructured;
      return {
        client: c.id as string,
        name: (c.name as string) ?? (c.id as string),
        sector: (c.sector as string | null) ?? null,
        items: Array.isArray(structured.items) ? structured.items : [],
        generatedAt: structured.generatedAt ?? o?.created_at ?? null,
        bodyMd: o?.body_md ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Última corrida de tendencias de un cliente puntual. */
export async function getLatestSectorTrends(
  clientId: string,
): Promise<ClientTrends | null> {
  const admin = getSupabaseAdmin();
  const { data: client } = await admin
    .from("clients")
    .select("id, name, sector")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return null;

  const { data: output } = await admin
    .from("agent_outputs")
    .select("structured, body_md, created_at")
    .eq("client", clientId)
    .eq("output_type", "sector-trends")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const structured = (output?.structured ?? {}) as TrendsStructured;
  return {
    client: client.id as string,
    name: (client.name as string) ?? clientId,
    sector: (client.sector as string | null) ?? null,
    items: Array.isArray(structured.items) ? structured.items : [],
    generatedAt: structured.generatedAt ?? (output?.created_at as string) ?? null,
    bodyMd: (output?.body_md as string | null) ?? null,
  };
}
