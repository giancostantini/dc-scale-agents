"use client";

/**
 * ProductSidebar — backoffice administrativo de una aplicación SaaS propia
 * (Tildalo, Encargue, Rondín, Libreta). Estructura completa estilo centro de
 * control: Inicio, Clientes, Suscripciones, Producto (+ módulos específicos),
 * Growth, Atención, Tecnología, Seguridad, Configuración. Las FINANZAS de
 * cada app viven en el portal financiero (link al final).
 *
 * Incluye selector de aplicación arriba a la izquierda.
 */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ProductBrand } from "@/lib/productos";
import { PRODUCTS } from "@/lib/productos";
import { appMeta } from "@/lib/backoffice-demo";
import { IArrowLeft } from "./icons/BrandIcons";
import styles from "./ClientSidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  glyph: string;
}
interface NavSection {
  label: string;
  items: NavItem[];
  collapsible?: boolean;
}

export default function ProductSidebar({
  product,
  onHide,
}: {
  product: ProductBrand;
  onHide?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/producto/${product.slug}`;
  const meta = appMeta(product.slug);

  const sections: NavSection[] = [
    {
      label: "Inicio",
      items: [{ href: base, label: "Dashboard ejecutivo", glyph: "◈" }],
    },
    {
      label: "Clientes",
      collapsible: true,
      items: [
        { href: `${base}/clientes/empresas`, label: "Empresas", glyph: "◉" },
        { href: `${base}/clientes/usuarios`, label: "Usuarios", glyph: "◍" },
        { href: `${base}/clientes/salud`, label: "Salud de clientes", glyph: "♥" },
        { href: `${base}/clientes/oportunidades`, label: "Oportunidades", glyph: "⤴" },
      ],
    },
    {
      label: "Suscripciones",
      collapsible: true,
      items: [
        { href: `${base}/suscripciones`, label: "Suscripciones", glyph: "⟳" },
        { href: `${base}/suscripciones/planes`, label: "Planes", glyph: "▤" },
      ],
    },
    {
      label: "Producto",
      collapsible: true,
      items: [
        { href: `${base}/producto/uso`, label: "Uso", glyph: "▲" },
        { href: `${base}/producto/funcionalidades`, label: "Funcionalidades", glyph: "◇" },
        { href: `${base}/producto/actividad`, label: "Actividad", glyph: "≋" },
        ...meta.modules.map((m) => ({ href: `${base}/modulo/${m.key}`, label: m.label, glyph: "·" })),
      ],
    },
    {
      label: "Growth",
      collapsible: true,
      items: [
        { href: `${base}/growth/contenido`, label: "Calendario de contenido", glyph: "◧" },
        { href: `${base}/growth/pauta`, label: "Pauta publicitaria", glyph: "◔" },
        { href: `${base}/growth/producciones`, label: "Producciones", glyph: "✦" },
        { href: `${base}/growth/reporting`, label: "Reporting", glyph: "▦" },
        { href: `${base}/growth/prospeccion`, label: "Prospección", glyph: "⤳" },
      ],
    },
    {
      label: "Atención",
      collapsible: true,
      items: [
        { href: `${base}/atencion/tickets`, label: "Tickets", glyph: "✉" },
        { href: `${base}/atencion/incidencias`, label: "Incidencias", glyph: "⚠" },
        { href: `${base}/atencion/solicitudes`, label: "Solicitudes", glyph: "✎" },
      ],
    },
    {
      label: "Tecnología",
      collapsible: true,
      items: [
        { href: `${base}/tecnologia/integraciones`, label: "Integraciones", glyph: "⇄" },
        { href: `${base}/tecnologia/errores`, label: "Errores", glyph: "✕" },
        { href: `${base}/tecnologia/apis`, label: "APIs", glyph: "⊞" },
        { href: `${base}/tecnologia/infraestructura`, label: "Infraestructura", glyph: "▥" },
      ],
    },
    {
      label: "Seguridad",
      collapsible: true,
      items: [
        { href: `${base}/seguridad/accesos`, label: "Accesos", glyph: "⚿" },
        { href: `${base}/seguridad/roles`, label: "Roles y permisos", glyph: "◫" },
        { href: `${base}/seguridad/audit`, label: "Audit log", glyph: "☰" },
      ],
    },
    {
      label: "Configuración",
      collapsible: true,
      items: [{ href: `${base}/configuracion`, label: "Configuración", glyph: "⚙" }],
    },
  ];

  function isActive(href: string) {
    if (href === base) return pathname === base;
    return pathname === href || (pathname?.startsWith(href + "/") ?? false);
  }

  function switchApp(slug: string) {
    if (slug === "__all__") router.push("/producto");
    else router.push(`/producto/${slug}`);
  }

  return (
    <aside className={styles.sidebar}>
      {onHide && (
        <button type="button" className={styles.hideBtn} onClick={onHide} title="Ocultar menú" aria-label="Ocultar menú lateral">‹</button>
      )}
      <button className={styles.back} onClick={() => router.push("/hub")}>
        <IArrowLeft size={15} /> Business Hub
      </button>

      {/* Selector de aplicación */}
      <div style={{ padding: "0 14px", marginBottom: 12 }}>
        <label style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--sand-dark)", fontWeight: 700 }}>Aplicación</label>
        <select
          value={product.slug}
          onChange={(e) => switchApp(e.target.value)}
          style={{
            width: "100%", marginTop: 5, padding: "9px 10px", borderRadius: 8,
            border: `1px solid ${product.accent}44`, background: "var(--white)",
            color: "var(--deep-green)", fontWeight: 700, fontSize: 14, fontFamily: "inherit",
            cursor: "pointer", outline: "none",
          }}
        >
          {PRODUCTS.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          <option value="__all__">Todas las aplicaciones</option>
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px 12px", borderBottom: "1px solid rgba(10,26,12,0.06)", marginBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.logo} alt={product.name} style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 7 }} />
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Backoffice · {meta.unit}</div>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {sections.map((section) => (
          <Section
            key={section.label}
            section={section}
            isActive={isActive}
            accent={product.accent}
            onNavigate={(href) => router.push(href)}
            defaultOpen={section.items.some((it) => isActive(it.href)) || !section.collapsible}
          />
        ))}

        {/* Finanzas → portal financiero */}
        <div className={styles.section}>
          <div style={sectionLabelStyle}>Finanzas</div>
          <button className={styles.item} onClick={() => router.push(`/finanzas?app=${product.slug}`)}>
            <span style={glyphStyle}>$</span>
            <span className={styles.itemLabel}>Ver en portal financiero →</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function Section({
  section,
  isActive,
  accent,
  onNavigate,
  defaultOpen,
}: {
  section: NavSection;
  isActive: (href: string) => boolean;
  accent: string;
  onNavigate: (href: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const single = section.items.length === 1 && !section.collapsible;

  if (single) {
    const it = section.items[0];
    const active = isActive(it.href);
    return (
      <div className={styles.section}>
        <button
          className={`${styles.item} ${active ? styles.active : ""}`}
          onClick={() => onNavigate(it.href)}
          style={active ? { borderLeft: `2px solid ${accent}` } : undefined}
        >
          <span style={glyphStyle}>{it.glyph}</span>
          <span className={styles.itemLabel}>{it.label}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ ...sectionLabelStyle, display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <span>{section.label}</span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && section.items.map((it) => {
        const active = isActive(it.href);
        return (
          <button
            key={it.href}
            className={`${styles.item} ${active ? styles.active : ""}`}
            onClick={() => onNavigate(it.href)}
            style={active ? { borderLeft: `2px solid ${accent}` } : undefined}
          >
            <span style={glyphStyle}>{it.glyph}</span>
            <span className={styles.itemLabel}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--sand-dark)",
  fontWeight: 700, padding: "4px 14px", margin: 0,
};
const glyphStyle: React.CSSProperties = {
  width: 18, display: "inline-flex", justifyContent: "center", fontSize: 13, opacity: 0.75,
};
