"use client";

/**
 * Accesos del dashboard del cliente growth: Looker Studio, Espor.ai y
 * programar publicidad.
 *
 * Reemplazan a las páginas Analítica y Paid Media, que se eliminaron
 * (mig 102). Los links se cargan en Configuración → "Analítica y
 * publicidad". Programar publicidad abre el generador de campañas Meta
 * (/meta), que es solo de directores.
 */

import Link from "next/link";
import type { Client } from "@/lib/types";

export default function ClientQuickLinks({
  client,
  isDirector,
}: {
  client: Client;
  isDirector: boolean;
}) {
  const configHref = `/cliente/${client.id}/configuracion#links-analitica`;
  // Looker: el campo editable vive en external_links; la columna
  // clients.looker_studio_url (mig 027) quedó como fallback legacy.
  const looker =
    client.external_links?.looker_studio_url?.trim() ||
    client.looker_studio_url?.trim() ||
    null;
  const espor = client.external_links?.espor_ai_url?.trim() || null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}
    >
      <QuickLink
        icon="▤"
        title="Looker Studio"
        subtitle="Métricas generales del negocio"
        href={looker}
        external
        configHref={isDirector ? configHref : null}
      />
      <QuickLink
        icon="◎"
        title="Espor.ai"
        subtitle="Análisis de la pauta"
        href={espor}
        external
        configHref={isDirector ? configHref : null}
      />
      {isDirector && (
        <QuickLink
          icon="＋"
          title="Programar publicidad"
          subtitle="Generador de campañas Meta"
          href={`/meta?client=${client.id}`}
        />
      )}
    </div>
  );
}

function QuickLink({
  icon,
  title,
  subtitle,
  href,
  external = false,
  configHref = null,
}: {
  icon: string;
  title: string;
  subtitle: string;
  /** null = link sin configurar. */
  href: string | null;
  external?: boolean;
  /** Si el link no está cargado: a dónde manda al director para cargarlo. */
  configHref?: string | null;
}) {
  const box: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    background: "var(--white)",
    border: "1px solid rgba(10,26,12,0.08)",
    borderRadius: "var(--r-md)",
    textDecoration: "none",
    color: "var(--deep-green)",
    minWidth: 0,
  };
  const body = (
    <>
      <span style={{ fontSize: 20, color: "var(--sand-dark)", lineHeight: 1, flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{title}</span>
        <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {href ? subtitle : configHref ? "Sin link cargado — configurar →" : "Sin link cargado"}
        </span>
      </span>
      {href && (
        <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
          {external ? "↗" : "→"}
        </span>
      )}
    </>
  );

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={box}>
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} style={box}>
        {body}
      </Link>
    );
  }
  if (configHref) {
    return (
      <Link href={configHref} style={{ ...box, borderStyle: "dashed" }}>
        {body}
      </Link>
    );
  }
  return (
    <div
      style={{ ...box, borderStyle: "dashed", opacity: 0.6 }}
      title="Un director tiene que cargar el link en Configuración"
    >
      {body}
    </div>
  );
}
