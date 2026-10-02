"use client";

/**
 * ProductSidebar — menú lateral del backend comercial de un producto
 * (Tildalo, Encargue, Rondín). Mismo look que ClientSidebar (reusa su CSS).
 *
 * Menús:
 *   · Home (dashboard inicial)
 *   · Tablero de control comercial
 *   · Growth (expandible → mismos submenús que un cliente growth)
 *   · Equipo
 */

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  IDashboard,
  IReporting,
  IContenido,
  ICalendario,
  IProducciones,
  IAnalitica,
  IPipeline,
  IArrowLeft,
  type BrandIconProps,
} from "./icons/BrandIcons";
import type { ProductBrand } from "@/lib/productos";
import styles from "./ClientSidebar.module.css";

type IconComp = (props: BrandIconProps) => React.JSX.Element;

interface NavItem {
  href: string;
  icon: IconComp;
  label: string;
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

  // Submenús de Growth: mismos módulos que un cliente growth.
  const growthItems: NavItem[] = [
    { href: `${base}/growth/contenido`, icon: ICalendario, label: "Calendario de contenido" },
    { href: `${base}/growth/pauta`, icon: IAnalitica, label: "Pauta publicitaria" },
    { href: `${base}/growth/producciones`, icon: IProducciones, label: "Producciones" },
    { href: `${base}/growth/reporting`, icon: IReporting, label: "Reporting" },
    { href: `${base}/growth/prospeccion`, icon: IPipeline, label: "Prospección" },
  ];

  const growthActive = pathname?.startsWith(`${base}/growth`) ?? false;
  const [growthOpen, setGrowthOpen] = useState(growthActive);

  const topItems: NavItem[] = [
    { href: base, icon: IDashboard, label: "Home" },
    { href: `${base}/comercial`, icon: IReporting, label: "Tablero comercial" },
  ];

  function renderItem(it: NavItem, indent = false) {
    const active = pathname === it.href;
    const Icon = it.icon;
    return (
      <button
        key={it.href}
        className={`${styles.item} ${active ? styles.active : ""}`}
        onClick={() => router.push(it.href)}
        style={indent ? { paddingLeft: 34 } : undefined}
      >
        <Icon className={styles.icon} size={indent ? 15 : 17} strokeWidth={1.6} />
        <span className={styles.itemLabel}>{it.label}</span>
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
          title="Ocultar menú"
          aria-label="Ocultar menú lateral"
        >
          ‹
        </button>
      )}
      <button className={styles.back} onClick={() => router.push("/hub")}>
        <IArrowLeft size={15} /> Nuestros productos
      </button>

      <div className={styles.info}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.logo}
          alt={product.name}
          style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 12 }}
        />
        <div className={styles.name}>{product.name}</div>
        <div className={styles.sector}>Backend comercial</div>
      </div>

      <div className={styles.section}>
        {topItems.map((it) => renderItem(it))}

        {/* Growth — expandible */}
        <button
          className={`${styles.item} ${growthActive ? styles.active : ""}`}
          onClick={() => setGrowthOpen((v) => !v)}
        >
          <IContenido className={styles.icon} size={17} strokeWidth={1.6} />
          <span className={styles.itemLabel}>Growth</span>
          <span style={{ marginLeft: "auto", opacity: 0.6, fontSize: 11 }}>
            {growthOpen ? "▾" : "▸"}
          </span>
        </button>
        {growthOpen && growthItems.map((it) => renderItem(it, true))}
      </div>
    </aside>
  );
}
