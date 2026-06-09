/**
 * sector-trends-context.js — retroalimentación de tendencias a los agentes.
 *
 * El agente `sector-trends` escribe `vault/clients/<slug>/sector-trends.md` con
 * las tendencias recientes del nicho (qué contenido funciona, qué trae tráfico,
 * qué convierte). Este módulo lo lee y arma un bloque para inyectar en el prompt
 * de los agentes de contenido (creative-assistant, content-strategy, seo), para
 * que generen alineados a lo que funciona AHORA — no aislados.
 *
 * Principio del sistema: todo se retroalimenta.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

/** Lee sector-trends.md del cliente. Null si no existe (no rompe). */
export function readSectorTrends(vaultRoot, client) {
  try {
    return readFileSync(
      resolve(vaultRoot, "clients", client, "sector-trends.md"),
      "utf-8",
    );
  } catch {
    return null;
  }
}

/**
 * Bloque para inyectar en el prompt. "" si no hay tendencias (no ensucia).
 * Trunca para no inflar el prompt (las tendencias pueden ser largas).
 */
export function buildSectorTrendsBlock(trendsMd) {
  if (!trendsMd || !trendsMd.trim()) return "";
  const MAX = 3500;
  const body =
    trendsMd.length > MAX ? `${trendsMd.slice(0, MAX)}\n…(truncado)` : trendsMd;
  return [
    "--- TENDENCIAS DEL NICHO (recientes — del agente sector-trends) ---",
    "Alineá el contenido a lo que funciona AHORA en el nicho (formatos/hooks que se",
    "están volviendo virales, lo que trae tráfico, lo que convierte). Son señales",
    "EXTERNAS del mercado; combinálas con los datos históricos propios del cliente.",
    "",
    body,
  ].join("\n");
}
