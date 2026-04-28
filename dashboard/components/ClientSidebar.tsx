"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { deleteClient } from "@/lib/storage";
import type { Client } from "@/lib/types";
import styles from "./ClientSidebar.module.css";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  directorOnly?: boolean;
}

export default function ClientSidebar({ client }: { client: Client }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDirector, setIsDirector] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const navGP: NavItem[] = [
    { href: base,                  icon: "◈", label: "Dashboard" },
    { href: `${base}/planificador`, icon: "▦", label: "Planificador" },
    { href: `${base}/paid-media`,   icon: "◉", label: "Paid Media" },
    { href: `${base}/fabrica`,      icon: "⚑", label: "Fábrica de contenidos" },
    { href: `${base}/campanas`,     icon: "◎", label: "Campañas" },
    { href: `${base}/analitica`,    icon: "↗", label: "Analítica" },
    { href: `${base}/fases`,        icon: "⁞", label: "Fases del negocio" },
    { href: `${base}/objetivos`,    icon: "◆", label: "Setear objetivos", directorOnly: true },
  ];

  const navDev: NavItem[] = [
    { href: base,                  icon: "◈", label: "Dashboard" },
    { href: `${base}/sprints`,      icon: "▣", label: "Sprints" },
    { href: `${base}/nueva-tarea`,  icon: "+", label: "Nueva tarea" },
  ];

  const gestion: NavItem[] = [
    { href: `${base}/biblioteca`,    icon: "▢", label: "Biblioteca" },
    { href: `${base}/brandbook`,     icon: "◐", label: "Brandbook" },
    ...(client.type === "gp"
      ? [
          { href: `${base}/agentes`,  icon: "⚡", label: "Agentes IA" },
          { href: `${base}/routing`,  icon: "⇄", label: "Routing" },
        ]
      : []),
    { href: `${base}/notas`,         icon: "✎", label: "Notas internas" },
    { href: `${base}/integraciones`, icon: "◈", label: "Integraciones" },
  ];

  const nav = client.type === "gp" ? navGP : navDev;

  function renderItem(it: NavItem) {
    if (it.directorOnly && !isDirector) return null;
    const active = pathname === it.href;
    return (
      <button
        key={it.href}
        className={`${styles.item} ${active ? styles.active : ""}`}
        onClick={() => router.push(it.href)}
      >
        <span className={styles.icon}>{it.icon}</span> {it.label}
        {it.directorOnly && <span className={styles.directorTag}>DIRECTOR</span>}
      </button>
    );
  }

  return (
    <aside className={styles.sidebar}>
      <button className={styles.back} onClick={() => router.push("/hub")}>
        ← Volver al hub
      </button>

      <div className={styles.info}>
        <div className={styles.logo}>{client.initials}</div>
        <div className={styles.name}>{client.name}</div>
        <div className={styles.sector}>{client.sector}</div>
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Navegación</div>
        {nav.map(renderItem)}
      </div>

      <div className={styles.section}>
        <div className={styles.label}>Gestión</div>
        {gestion.map(renderItem)}
      </div>

      {isDirector && (
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
            <span className={styles.icon}>×</span>
            {deleting ? "Eliminando…" : "Eliminar cliente"}
            <span className={styles.directorTag}>DIRECTOR</span>
          </button>
        </div>
      )}
    </aside>
  );
}
