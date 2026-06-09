/**
 * client-memory.js — puente entre lo que el equipo "le enseña" al Consultor y
 * los agentes operativos.
 *
 * El Consultor persiste directivas por cliente con su tool `save_memory` en la
 * tabla `consultant_memory_v2` (scope_type='client'). PERO los agentes
 * operativos (creative-assistant, content-strategy, ...) leen el vault, no esa
 * tabla — así que sin esto, "no uses humor negro para X" o "el tono es Y" que
 * le dijimos al Consultor NUNCA llegaba a quien genera el contenido.
 *
 * Este módulo lee esa memoria y arma un bloque de directivas para inyectar en
 * el prompt del agente. Cierra el loop: equipo → Consultor (save_memory) →
 * agentes.
 */

import { select } from "./supabase.js";

const KIND_LABEL = {
  constraint: "Restricción",
  preference: "Preferencia",
  past_decision: "Decisión previa",
  learning: "Aprendizaje",
};

// Orden de prioridad en el prompt: las restricciones son reglas duras y van
// primero; los aprendizajes, últimos.
const KIND_ORDER = ["constraint", "preference", "past_decision", "learning"];

/**
 * Trae la memoria que el equipo/Consultor persistió para un cliente.
 * Non-fatal: si Supabase no está configurado o falla, devuelve [].
 *
 * @param {string} clientId
 * @param {number} [limit]
 * @returns {Promise<Array<{kind:string, content:string, importance:number}>>}
 */
export async function fetchClientMemory(clientId, limit = 20) {
  if (!clientId) return [];
  const rows = await select(
    "consultant_memory_v2",
    { scope_type: "client", client_id: clientId },
    "kind,content,importance,created_at",
    { order: "importance.desc,created_at.desc", limit },
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Arma el bloque de "directivas del equipo" para el prompt. Devuelve "" si no
 * hay memoria (no ensucia el prompt).
 */
export function buildClientMemoryBlock(rows) {
  if (!rows || rows.length === 0) return "";
  const sorted = [...rows].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );
  const lines = [
    "--- DIRECTIVAS DEL EQUIPO (memoria del Consultor — lo que nos pidieron para este cliente) ---",
    ...sorted.map((r) => `- [${KIND_LABEL[r.kind] || r.kind}] ${r.content}`),
    "Estas son instrucciones EXPLÍCITAS del equipo para este cliente: tienen prioridad sobre tu criterio general. Las restricciones son reglas duras (nunca violarlas).",
  ];
  return lines.join("\n");
}
