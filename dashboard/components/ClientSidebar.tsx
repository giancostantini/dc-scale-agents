"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IDashboard,
  IFases,
  ICalendario,
  IProducciones,
  IAnalitica,
  ITareas,
  IPlus,
  IBiblioteca,
  IObjetivos,
  INotas,
  IArrowLeft,
  IContenido,
  IReporting,
  IConfiguracion,
  ISprints,
  type BrandIconProps,
} from "./icons/BrandIcons";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { listAssignmentsForUser } from "@/lib/team";
import type { Client } from "@/lib/types";
import styles from "./ClientSidebar.module.css";

type IconComp = (props: BrandIconProps) => React.JSX.Element;

interface NavItem {
  /** Key estable que matchea lib/client-menus.ts CLIENT_MENUS_*. */
  key: string;
  href: string;
  icon: IconComp;
  label: string;
  directorOnly?: boolean;
}

export default function ClientSidebar({
  client,
  onHide,
}: {
  client: Client;
  /** Si está definida, se renderiza un botón "ocultar" en la esquina
   *  superior derecha del sidebar. El parent (layout) controla el
   *  estado y persiste en localStorage. */
  onHide?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDirector, setIsDirector] = useState(false);
  /** visible_menus de la asignación del viewer a este cliente.
   *  undefined = todavía no se cargó, null = ver todos, string[] = filtrar. */
  const [visibleMenus, setVisibleMenus] = useState<
    string[] | null | undefined
  >(undefined);

  useEffect(() => {
    getCurrentProfile().then(async (p) => {
      if (!p) return;
      const dir = p.role === "director";
      setIsDirector(dir);
      // Director ignora visible_menus, así que no hace falta cargar.
      if (dir) {
        setVisibleMenus(null);
        return;
      }
      // Team: leer asignaciones del viewer y buscar la que matchea
      // este cliente. Si tiene varias (distinto role_in_client), el
      // visible_menus efectivo = UNIÓN de todas (le damos el set más
      // permisivo).
      const all = await listAssignmentsForUser(p.id);
      const mine = all.filter((a) => a.client_id === client.id);
      if (mine.length === 0) {
        // No asignado → ver todos los menús (RLS del cliente decidirá
        // si puede entrar a cada página).
        setVisibleMenus(null);
        return;
      }
      const anyUnrestricted = mine.some((a) => !a.visible_menus);
      if (anyUnrestricted) {
        setVisibleMenus(null); // al menos una asignación sin restricción
        return;
      }
      const union = new Set<string>();
      for (const a of mine) {
        for (const k of a.visible_menus ?? []) union.add(k);
      }
      setVisibleMenus([...union]);
    });
  }, [client.id]);

  const base = `/cliente/${client.id}`;

  // Menú UNIFICADO (sin split nav/gestión). Orden por flujo de uso:
  // dashboard → estrategia → ejecución → análisis → soporte.
  const navGP: NavItem[] = [
    { key: "dashboard",   href: base,                   icon: IDashboard,     label: "Dashboard" },
    { key: "fases",       href: `${base}/fases`,         icon: IFases,         label: "Fases del negocio" },
    { key: "objetivos",   href: `${base}/objetivos`,     icon: IObjetivos,     label: "Objetivos", directorOnly: true },
    { key: "calendario",  href: `${base}/planificador`,  icon: ICalendario,    label: "Calendario" },
    { key: "contenido",   href: `${base}/contenido`,     icon: IContenido,     label: "Contenido" },
    { key: "tareas",      href: `${base}/tareas`,        icon: ITareas,        label: "Tareas" },
    { key: "producciones",href: `${base}/campanas`,      icon: IProducciones,  label: "Producciones" },
    { key: "analitica",   href: `${base}/analitica`,     icon: IAnalitica,     label: "Analítica" },
    { key: "reporting",   href: `${base}/reporting`,     icon: IReporting,     label: "Reporting" },
    { key: "biblioteca",  href: `${base}/biblioteca`,    icon: IBiblioteca,    label: "Biblioteca" },
    { key: "notas",       href: `${base}/notas`,         icon: INotas,         label: "Notas internas" },
    { key: "configuracion", href: `${base}/configuracion`, icon: IConfiguracion, label: "Configuración", directorOnly: true },
  ];

  const navDev: NavItem[] = [
    { key: "dashboard",   href: base,                    icon: IDashboard,     label: "Dashboard" },
    { key: "sprints",     href: `${base}/sprints`,       icon: ISprints,       label: "Sprints" },
    { key: "nueva-tarea", href: `${base}/nueva-tarea`,   icon: IPlus,          label: "Nueva tarea" },
    { key: "tareas",      href: `${base}/tareas`,        icon: ITareas,        label: "Tareas del cliente" },
    { key: "notas",       href: `${base}/notas`,         icon: INotas,         label: "Notas internas" },
    { key: "configuracion", href: `${base}/configuracion`, icon: IConfiguracion, label: "Configuración", directorOnly: true },
  ];

  const baseNav = client.type === "gp" ? navGP : navDev;
  // Si el viewer es team y tiene visible_menus configurado, filtramos
  // a los keys listados.  Director (visibleMenus=null) ve todo.
  // Team sin restricción (visibleMenus=null) también ve todo.
  // Los items directorOnly siguen filtrándose dentro de renderItem.
  const nav =
    isDirector || !visibleMenus
      ? baseNav
      : baseNav.filter((it) => visibleMenus.includes(it.key));

  function renderItem(it: NavItem) {
    if (it.directorOnly && !isDirector) return null;
    const active = pathname === it.href;
    const Icon = it.icon;
    return (
      <button
        key={it.href}
        className={`${styles.item} ${active ? styles.active : ""}`}
        onClick={() => router.push(it.href)}
      >
        <Icon className={styles.icon} size={17} strokeWidth={1.6} />
        <span className={styles.itemLabel}>{it.label}</span>
        {it.directorOnly && <span className={styles.directorTag}>DIRECTOR</span>}
      </button>
    );
  }

  return (
    <aside className={styles.sidebar}>
      {onHide && (
        <button
          type="button"
          className={styles.hideBtn}
          onClick={onHide}
          title="Ocultar menú para ver más ancho"
          aria-label="Ocultar menú lateral"
        >
          ‹
        </button>
      )}
      <button className={styles.back} onClick={() => router.push("/hub")}>
        <IArrowLeft size={15} /> Volver al hub
      </button>

      <div className={styles.info}>
        <div className={styles.logo}>{client.initials}</div>
        <div className={styles.name}>{client.name}</div>
        <div className={styles.sector}>{client.sector}</div>
      </div>

      <div className={styles.section}>
        {nav.map(renderItem)}
      </div>

      {/* "Invitar al portal" y "Eliminar cliente" ahora viven en
          /cliente/[id]/configuracion (visible solo para director). */}
    </aside>
  );
}
