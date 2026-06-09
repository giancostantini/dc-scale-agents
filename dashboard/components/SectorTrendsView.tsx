/**
 * SectorTrendsView — render presentacional (sin fetch) de las tendencias del
 * nicho, agrupadas por categoría, con link a la fuente de cada una.
 *
 * Compartido: lo usa la página /portal/tendencias (cliente) y la vista
 * consolidada interna (directores/equipo). No tiene hooks → sirve en server
 * y client components.
 */

import styles from "./SectorTrendsView.module.css";

export interface TrendItem {
  title: string;
  summary?: string;
  category?: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  contenido: { label: "Contenido que funciona", icon: "🎬" },
  trafico: { label: "Tráfico a la web", icon: "📈" },
  ventas: { label: "Ventas / conversión", icon: "🛒" },
  noticias: { label: "Noticias del sector", icon: "📰" },
  publicidad: { label: "Publicidad / campañas", icon: "📣" },
  estacional: { label: "Estacional / próximo", icon: "🗓️" },
};
const CATEGORY_ORDER = [
  "contenido",
  "trafico",
  "ventas",
  "noticias",
  "publicidad",
  "estacional",
];

export default function SectorTrendsView({
  items,
  fallbackMarkdown,
  emptyLabel = "Todavía no hay tendencias cargadas. El agente las actualiza cada semana.",
}: {
  items: TrendItem[];
  fallbackMarkdown?: string | null;
  emptyLabel?: string;
}) {
  if (!items || items.length === 0) {
    if (fallbackMarkdown && fallbackMarkdown.trim()) {
      return (
        <div
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--text-muted)",
          }}
        >
          {fallbackMarkdown}
        </div>
      );
    }
    return <p className={styles.empty}>{emptyLabel}</p>;
  }

  const groups = new Map<string, TrendItem[]>();
  for (const it of items) {
    const cat = CATEGORY_META[it.category ?? ""] ? (it.category as string) : "otros";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(it);
  }
  const orderedCats = [
    ...CATEGORY_ORDER.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  return (
    <div className={styles.groups}>
      {orderedCats.map((cat) => {
        const meta = CATEGORY_META[cat] ?? { label: "Otras señales", icon: "•" };
        return (
          <section key={cat} className={styles.group}>
            <h3 className={styles.groupTitle}>
              <span aria-hidden="true">{meta.icon}</span> {meta.label}
            </h3>
            <ul className={styles.list}>
              {groups.get(cat)!.map((it, i) => (
                <li key={`${cat}-${i}`} className={styles.item}>
                  <div className={styles.itemTitle}>{it.title}</div>
                  {it.summary && <p className={styles.itemSummary}>{it.summary}</p>}
                  {it.sourceUrl && (
                    <a
                      className={styles.source}
                      href={it.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {it.sourceTitle || "Ver fuente"} ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
