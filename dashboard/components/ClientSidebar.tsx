"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentProfile } from "@/lib/supabase/auth";
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

  useEffect(() => {
    getCurrentProfile().then((p) => {
      if (p) setIsDirector(p.role === "director");
    });
  }, []);

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
    </aside>
  );
}
