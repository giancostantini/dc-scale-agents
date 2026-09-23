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

/**
 * Menús del sidebar para clientes Growth Partner.
 *
 * Salieron del menú (mig 102, dashboard simplificado): Estrategia
 * (`fases` → botón en Biblioteca), Contenido (`contenido` → el trabajo
 * vive en el Calendario; la página sigue viva por link directo), Ofertas
 * (`ofertas` → pestaña dentro de Solicitudes), Paid Media y Analítica
 * (`paid_media` / `analitica` → botones del Dashboard). Sus keys pueden
 * seguir guardadas en visible_menus: ver MENU_ALIASES.
 */
export const CLIENT_MENUS_GP: ClientMenuItem[] = [
  { key: "dashboard",   segment: "",              label: "Dashboard" },
  { key: "calendario",  segment: "planificador",   label: "Calendario" },
  { key: "tareas",      segment: "tareas",         label: "Tareas" },
  { key: "solicitudes", segment: "solicitudes",    label: "Solicitudes y ofertas" },
  { key: "producciones",segment: "campanas",       label: "Producciones" },
  { key: "reporting",   segment: "reporting",      label: "Reporting" },
  { key: "talles",      segment: "talles",         label: "Talles faltantes" },
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
 * Menús que se fusionaron en otro (mig 102): quien tenía permiso al
 * viejo ve el nuevo. Las keys viejas siguen guardadas en visible_menus
 * de asignaciones existentes; sin esto, un miembro con menús
 * restringidos se quedaba sin su sección de trabajo.
 *
 * A propósito NO se aliasa nada hacia dashboard ni biblioteca (desde
 * paid_media / analitica / fases): darían acceso a presupuestos o
 * facturas que ese miembro antes no veía. Eso lo decide un director.
 */
export const MENU_ALIASES: Record<string, string> = {
  contenido: "calendario",
  ofertas: "solicitudes",
};

/** visible_menus con los alias resueltos (keys viejas + las nuevas). */
export function expandVisibleMenus(keys: string[]): Set<string> {
  const out = new Set(keys);
  for (const k of keys) {
    const alias = MENU_ALIASES[k];
    if (alias) out.add(alias);
  }
  return out;
}

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
  const allowed = expandVisibleMenus(opts.visibleMenus);
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
