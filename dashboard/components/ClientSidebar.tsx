"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Layers,
  Map,
  Clapperboard,
  TrendingUp,
  ListChecks,
  Plus,
  BookOpen,
  Inbox,
  Target,
  PenLine,
  Mail,
  Trash2,
  ArrowLeft,
  Sparkles,
  FileText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { deleteClient } from "@/lib/storage";
import { listAssignmentsForUser } from "@/lib/team";
import InviteUserModal from "./InviteUserModal";
import type { Client } from "@/lib/types";
import styles from "./ClientSidebar.module.css";

interface NavItem {
  /** Key estable que matchea lib/client-menus.ts CLIENT_MENUS_*. */
  key: string;
  href: string;
  icon: LucideIcon;
  label: string;
  directorOnly?: boolean;
}

export default function ClientSidebar({ client }: { client: Client }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDirector, setIsDirector] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
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

  async function handleDeleteClient() {
    if (deleting) return;
    // Doble confirmación para acción destructiva: confirmar y luego pedir
    // que el director tipee el nombre del cliente como salvaguarda.
    if (
      !confirm(
        `¿Estás seguro que querés eliminar al cliente "${client.name}"?\n\n` +
          `Esto borra el cliente y TODO lo asociado: objetivos, notas, ` +
          `tareas, campañas, contenido, integraciones, eventos del calendario, ` +
          `pagos y rules de routing.\n\n` +
          `Esta acción NO se puede deshacer.`,
      )
    ) {
      return;
    }
    const typed = window.prompt(
      `Para confirmar, tipeá el nombre del cliente exacto:\n\n${client.name}`,
    );
    if (typed === null) return; // cancelado
    if (typed.trim() !== client.name) {
      alert("El nombre no coincide. Eliminación cancelada.");
      return;
    }

    setDeleting(true);
    try {
      await deleteClient(client.id);
      router.push("/hub");
    } catch (err) {
      const e = err as { code?: string; message?: string };
      console.error("deleteClient error:", err);
      alert(
        `No se pudo eliminar el cliente.\n${e.code ?? ""} ${e.message ?? ""}`,
      );
      setDeleting(false);
    }
  }

  const base = `/cliente/${client.id}`;

  // Menú UNIFICADO (sin split nav/gestión). Orden por flujo de uso:
  // dashboard → estrategia → ejecución → análisis → soporte.
  const navGP: NavItem[] = [
    { key: "dashboard",   href: base,                   icon: LayoutDashboard, label: "Dashboard" },
    { key: "fases",       href: `${base}/fases`,         icon: Layers,         label: "Fases del negocio" },
    { key: "objetivos",   href: `${base}/objetivos`,     icon: Target,         label: "Objetivos", directorOnly: true },
    { key: "calendario",  href: `${base}/planificador`,  icon: Map,            label: "Calendario" },
    { key: "contenido",   href: `${base}/contenido`,     icon: Sparkles,       label: "Contenido" },
    { key: "tareas",      href: `${base}/tareas`,        icon: ListChecks,     label: "Tareas" },
    { key: "producciones",href: `${base}/campanas`,      icon: Clapperboard,   label: "Producciones" },
    { key: "analitica",   href: `${base}/analitica`,     icon: TrendingUp,     label: "Analítica" },
    { key: "reporting",   href: `${base}/reporting`,     icon: FileText,       label: "Reporting" },
    { key: "biblioteca",  href: `${base}/biblioteca`,    icon: BookOpen,       label: "Biblioteca" },
    { key: "solicitudes", href: `${base}/solicitudes`,   icon: Inbox,          label: "Solicitudes del cliente" },
    { key: "notas",       href: `${base}/notas`,         icon: PenLine,        label: "Notas internas" },
    { key: "configuracion", href: `${base}/configuracion`, icon: Settings, label: "Configuración", directorOnly: true },
  ];

  const navDev: NavItem[] = [
    { key: "dashboard",   href: base,                    icon: LayoutDashboard, label: "Dashboard" },
    { key: "sprints",     href: `${base}/sprints`,       icon: ListChecks,     label: "Sprints" },
    { key: "nueva-tarea", href: `${base}/nueva-tarea`,   icon: Plus,           label: "Nueva tarea" },
    { key: "tareas",      href: `${base}/tareas`,        icon: ListChecks,     label: "Tareas" },
    { key: "biblioteca",  href: `${base}/biblioteca`,    icon: BookOpen,       label: "Biblioteca" },
    { key: "solicitudes", href: `${base}/solicitudes`,   icon: Inbox,          label: "Solicitudes del cliente" },
    { key: "notas",       href: `${base}/notas`,         icon: PenLine,        label: "Notas internas" },
    { key: "configuracion", href: `${base}/configuracion`, icon: Settings, label: "Configuración", directorOnly: true },
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
        <Icon className={styles.icon} size={17} strokeWidth={1.9} />
        <span className={styles.itemLabel}>{it.label}</span>
        {it.directorOnly && <span className={styles.directorTag}>DIRECTOR</span>}
      </button>
    );
  }

  return (
    <aside className={styles.sidebar}>
      <button className={styles.back} onClick={() => router.push("/hub")}>
        <ArrowLeft size={15} strokeWidth={2} /> Volver al hub
      </button>

      <div className={styles.info}>
        <div className={styles.logo}>{client.initials}</div>
        <div className={styles.name}>{client.name}</div>
        <div className={styles.sector}>{client.sector}</div>
      </div>

      <div className={styles.section}>
        {nav.map(renderItem)}
      </div>

      {isDirector && (
        <>
          <div className={styles.section}>
            <div className={styles.label}>Acceso del cliente</div>
            <button className={styles.item} onClick={() => setInviteOpen(true)}>
              <Mail className={styles.icon} size={17} strokeWidth={1.9} />
              <span className={styles.itemLabel}>Invitar al portal</span>
              <span className={styles.directorTag}>DIRECTOR</span>
            </button>
          </div>

          <div className={`${styles.section} ${styles.dangerSection}`}>
            <div className={`${styles.label} ${styles.dangerLabel}`}>
              Zona crítica
            </div>
            <button
              className={styles.deleteBtn}
              onClick={handleDeleteClient}
              disabled={deleting}
              title="Solo directores pueden eliminar un cliente"
            >
              <Trash2 className={styles.icon} size={16} strokeWidth={1.9} />
              <span className={styles.itemLabel}>
                {deleting ? "Eliminando…" : "Eliminar cliente"}
              </span>
              <span className={styles.directorTag}>DIRECTOR</span>
            </button>
          </div>
        </>
      )}

      {/* Modal unificado: pre-seleccionado en modo "cliente del portal"
          + clientId del cliente actual ya cargado. El director puede
          alternar a "miembro del equipo" desde el toggle si quiere. */}
      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        initialUserType="client"
        initialClientId={client.id}
      />
    </aside>
  );
}
