/**
 * Catálogo central de menús del sidebar del cliente.
 *
 * Cada item tiene un `key` único (estable, usado para el campo
 * visible_menus en client_assignments) + label + segmento de URL.
 *
 * Importado por:
 *   · components/ClientSidebar — para renderizar.
 *   · components/AssignmentMenusPicker — para que el director elija
 *     cuáles ve cada miembro asignado al cliente.
 *
 * Si agregás un menú al sidebar, agregalo acá también con un key
 * estable que no cambie nunca (es lo que se persiste en DB).
 */

export interface ClientMenuItem {
  /** ID estable usado en visible_menus[]. NO renombrar. */
  key: string;
  /** Path relativo (sin /cliente/[id] prefix). Vacío = dashboard. */
  segment: string;
  label: string;
  /** Solo visible para directores (ej: Objetivos, Facturación). */
  directorOnly?: boolean;
}

/** Menús del sidebar para clientes Growth Partner. */
export const CLIENT_MENUS_GP: ClientMenuItem[] = [
  { key: "dashboard",   segment: "",              label: "Dashboard" },
  { key: "fases",       segment: "fases",          label: "Estrategia" },
  { key: "calendario",  segment: "planificador",   label: "Calendario" },
  { key: "contenido",   segment: "contenido",      label: "Contenido" },
  { key: "tareas",      segment: "tareas",         label: "Tareas" },
  { key: "solicitudes", segment: "solicitudes",    label: "Solicitudes" },
  { key: "producciones",segment: "campanas",       label: "Producciones" },
  { key: "analitica",   segment: "analitica",      label: "Analítica" },
  { key: "reporting",   segment: "reporting",      label: "Reporting" },
  { key: "biblioteca",  segment: "biblioteca",     label: "Biblioteca" },
  { key: "notas",       segment: "notas",          label: "Notas internas" },
  { key: "accesos",     segment: "accesos",        label: "Accesos" },
  { key: "objetivos",   segment: "objetivos",      label: "Objetivos", directorOnly: true },
  { key: "configuracion", segment: "configuracion", label: "Configuración", directorOnly: true },
];

/** Menús del sidebar para clientes Desarrollo (IA / dev). */
export const CLIENT_MENUS_DEV: ClientMenuItem[] = [
  { key: "dashboard",   segment: "",            label: "Dashboard" },
  { key: "sprints",     segment: "sprints",     label: "Sprints" },
  { key: "nueva-tarea", segment: "nueva-tarea", label: "Nueva tarea" },
  { key: "tareas",      segment: "tareas",      label: "Tareas del cliente" },
  { key: "solicitudes", segment: "solicitudes", label: "Solicitudes" },
  { key: "notas",       segment: "notas",       label: "Notas internas" },
  { key: "accesos",     segment: "accesos",     label: "Accesos" },
  { key: "configuracion", segment: "configuracion", label: "Configuración", directorOnly: true },
];

/**
 * Devuelve los menús que un miembro del equipo puede ver para un
 * cliente, en orden de presentación.
 *
 *  - Si el viewer es director → SIEMPRE ve todos los menús del tipo
 *    de cliente.
 *  - Si el viewer es team y tiene asignación con visible_menus !=
 *    null → solo los keys listados.
 *  - Si visible_menus es null/undefined → ve TODOS los menús no-
 *    directorOnly (backward compat con asignaciones viejas).
 */
export function filterClientMenus(opts: {
  clientType: "gp" | "dev";
  isDirector: boolean;
  visibleMenus?: string[] | null;
}): ClientMenuItem[] {
  const catalog =
    opts.clientType === "gp" ? CLIENT_MENUS_GP : CLIENT_MENUS_DEV;
  // Director ve todo, incluyendo directorOnly
  if (opts.isDirector) return catalog;
  // Team sin restricción → todos los no-directorOnly
  if (!opts.visibleMenus) {
    return catalog.filter((m) => !m.directorOnly);
  }
  // Team con restricción → solo los listados (y nunca los directorOnly)
  const allowed = new Set(opts.visibleMenus);
  return catalog.filter((m) => !m.directorOnly && allowed.has(m.key));
}

/**
 * Default razonable: todos los menús no-directorOnly para el tipo
 * de cliente. Lo usamos al crear una asignación nueva sin selección.
 */
export function defaultVisibleMenus(clientType: "gp" | "dev"): string[] {
  const catalog =
    clientType === "gp" ? CLIENT_MENUS_GP : CLIENT_MENUS_DEV;
  return catalog.filter((m) => !m.directorOnly).map((m) => m.key);
}
