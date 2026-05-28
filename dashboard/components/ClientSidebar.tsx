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
  type LucideIcon,
} from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { deleteClient } from "@/lib/storage";
import InviteUserModal from "./InviteUserModal";
import type { Client } from "@/lib/types";
import styles from "./ClientSidebar.module.css";

interface NavItem {
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

  useEffect(() => {
    getCurrentProfile().then((p) => {
      if (p) setIsDirector(p.role === "director");
    });
  }, []);

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
    { href: base,                   icon: LayoutDashboard, label: "Dashboard" },
    { href: `${base}/fases`,         icon: Layers,         label: "Fases del negocio" },
    { href: `${base}/objetivos`,     icon: Target,         label: "Objetivos", directorOnly: true },
    { href: `${base}/planificador`,  icon: Map,            label: "Roadmap" },
    { href: `${base}/contenido`,     icon: Sparkles,       label: "Contenido" },
    { href: `${base}/tareas`,        icon: ListChecks,     label: "Tareas" },
    { href: `${base}/campanas`,      icon: Clapperboard,   label: "Producciones" },
    { href: `${base}/analitica`,     icon: TrendingUp,     label: "Analítica" },
    { href: `${base}/reporting`,     icon: FileText,       label: "Reporting" },
    { href: `${base}/biblioteca`,    icon: BookOpen,       label: "Biblioteca" },
    { href: `${base}/solicitudes`,   icon: Inbox,          label: "Solicitudes del cliente" },
    { href: `${base}/notas`,         icon: PenLine,        label: "Notas internas" },
  ];

  const navDev: NavItem[] = [
    { href: base,                    icon: LayoutDashboard, label: "Dashboard" },
    { href: `${base}/sprints`,       icon: ListChecks,     label: "Sprints" },
    { href: `${base}/nueva-tarea`,   icon: Plus,           label: "Nueva tarea" },
    { href: `${base}/tareas`,        icon: ListChecks,     label: "Tareas" },
    { href: `${base}/biblioteca`,    icon: BookOpen,       label: "Biblioteca" },
    { href: `${base}/solicitudes`,   icon: Inbox,          label: "Solicitudes del cliente" },
    { href: `${base}/notas`,         icon: PenLine,        label: "Notas internas" },
  ];

  const nav = client.type === "gp" ? navGP : navDev;

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
