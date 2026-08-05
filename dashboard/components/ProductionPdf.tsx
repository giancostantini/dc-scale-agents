"use client";

/**
 * ProductionPdf — ficha en PDF de una producción del apartado Growth.
 *
 * Una sola página A4 con el detalle de la producción: título, tipo,
 * estado, fechas, presupuesto / ejecutado / disponible y el desglose
 * de items. Estilo de marca (Brand Board 2026) igual que el resto de
 * los PDFs del sistema (PhaseReportPdf / RoadmapPdf).
 *
 * Se genera client-side con `pdf(<ProductionPdf .../>).toBlob()` desde
 * la página de producciones.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { CampaignExpense } from "@/lib/types";

const FONT_REGULAR = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

// El "&" de la firma va en DM Sans 200 (Brand Board 2026).
const FONT_AMP = "DM Sans";
Font.register({
  family: FONT_AMP,
  fonts: [{ src: "/fonts/DMSans-ExtraLight.ttf", fontWeight: 200 }],
});
Font.registerHyphenationCallback((w) => [w]);

const C = {
  deepGreen: "#0A1A0C",
  sand: "#C4A882",
  sandDark: "#9B8259",
  bone: "#FAF8F3",
  offWhite: "#E8E4DC",
  textMuted: "#7A8A7E",
  textSoft: "#5A6A5E",
  green: "#2f7d4f",
  red: "#b04b3a",
  hairline: "rgba(10,26,12,0.10)",
  hairlineSoft: "rgba(10,26,12,0.06)",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    paddingTop: 48,
    paddingBottom: 52,
    paddingHorizontal: 54,
    flexDirection: "column",
  },

  // Header: lockup DC + eyebrow
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.sand,
    borderBottomStyle: "solid",
    marginBottom: 26,
  },
  lockupTop: { flexDirection: "row", alignItems: "baseline" },
  dearmas: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    letterSpacing: -0.3,
    color: C.deepGreen,
  },
  amp: {
    fontFamily: FONT_AMP,
    fontWeight: 200,
    fontSize: 15,
    letterSpacing: -0.3,
    color: C.sand,
    marginLeft: 4,
  },
  costantini: {
    fontFamily: FONT_REGULAR,
    fontSize: 15,
    letterSpacing: -0.3,
    color: C.sandDark,
    marginTop: 1,
  },
  headerRight: { alignItems: "flex-end" },
  headerEyebrow: {
    fontFamily: FONT_BOLD,
    fontSize: 7.5,
    letterSpacing: 2,
    color: C.sandDark,
    textTransform: "uppercase",
  },
  headerClient: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    color: C.deepGreen,
    marginTop: 6,
    letterSpacing: -0.1,
  },

  // Title block
  typeEyebrow: {
    fontFamily: FONT_BOLD,
    fontSize: 8.5,
    letterSpacing: 2.4,
    color: C.sandDark,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  title: {
    fontFamily: FONT_BOLD,
    fontSize: 26,
    letterSpacing: -0.8,
    color: C.deepGreen,
    lineHeight: 1.1,
    flexShrink: 1,
  },
  statusPill: {
    fontFamily: FONT_BOLD,
    fontSize: 7.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
  },

  description: {
    fontFamily: FONT_REGULAR,
    fontSize: 10.5,
    color: C.textSoft,
    lineHeight: 1.6,
    marginBottom: 24,
  },

  // Meta grid (presupuesto / ejecutado / disponible)
  metaGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 26,
  },
  metaCell: {
    flex: 1,
    backgroundColor: C.bone,
    borderWidth: 0.6,
    borderColor: C.hairline,
    borderStyle: "solid",
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  metaLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 7,
    letterSpacing: 1.4,
    color: C.sandDark,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  metaValue: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
    color: C.deepGreen,
    letterSpacing: -0.3,
  },

  // Dates row
  datesRow: {
    flexDirection: "row",
    gap: 40,
    marginBottom: 26,
  },
  dateLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 7.5,
    letterSpacing: 1.6,
    color: C.sandDark,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  dateValue: {
    fontFamily: FONT_REGULAR,
    fontSize: 11,
    color: C.deepGreen,
  },

  // Section title
  sectionTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    letterSpacing: 1.6,
    color: C.sandDark,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  // Items table
  table: {
    borderWidth: 0.6,
    borderColor: C.hairline,
    borderStyle: "solid",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: C.deepGreen,
  },
  tableHeaderCell: {
    padding: 8,
    fontFamily: FONT_BOLD,
    fontSize: 8,
    color: C.bone,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairlineSoft,
    borderBottomStyle: "solid",
  },
  tableCell: {
    padding: 8,
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    color: C.deepGreen,
  },
  tableTotalRow: {
    flexDirection: "row",
    backgroundColor: C.offWhite,
  },
  tableTotalCell: {
    padding: 8,
    fontFamily: FONT_BOLD,
    fontSize: 10,
    color: C.deepGreen,
  },
  noItems: {
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    color: C.textMuted,
    fontStyle: "italic",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 26,
    left: 54,
    right: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 0.4,
    borderTopColor: C.hairlineSoft,
    borderTopStyle: "solid",
  },
  footerText: {
    fontFamily: FONT_REGULAR,
    fontSize: 7.5,
    color: C.textMuted,
    letterSpacing: 0.3,
  },
});

export interface ProductionPdfProps {
  clientName: string;
  title: string;
  type: string;
  description: string;
  status: "active" | "done";
  budget: number;
  spent: number;
  items: CampaignExpense[];
  startDate?: string;
  endDate?: string;
  createdAt?: string;
}

function money(n: number): string {
  return `US$ ${Math.round(n).toLocaleString("es-AR")}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function ProductionPdf({
  clientName,
  title,
  type,
  description,
  status,
  budget,
  spent,
  items,
  startDate,
  endDate,
  createdAt,
}: ProductionPdfProps) {
  const available = budget - spent;
  const today = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const validItems = items.filter((it) => it.label.trim() || it.amount > 0);
  const itemsTotal = validItems.reduce((s, it) => s + (it.amount || 0), 0);

  return (
    <Document
      title={`Producción · ${title} · ${clientName}`}
      author="Dearmas & Costantini"
      subject={`Ficha de producción — ${title}`}
      creator="Dearmas & Costantini Scale"
      producer="Dearmas & Costantini Scale"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.lockupTop}>
              <Text style={styles.dearmas}>Dearmas</Text>
              <Text style={styles.amp}>&</Text>
            </View>
            <Text style={styles.costantini}>Costantini</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerEyebrow}>Ficha de producción</Text>
            <Text style={styles.headerClient}>{clientName}</Text>
          </View>
        </View>

        {/* Título + estado */}
        <Text style={styles.typeEyebrow}>{type}</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          <Text
            style={{
              ...styles.statusPill,
              backgroundColor:
                status === "active" ? "rgba(47,125,79,0.14)" : "rgba(10,26,12,0.08)",
              color: status === "active" ? C.green : C.textSoft,
            }}
          >
            {status === "active" ? "En curso" : "Finalizada"}
          </Text>
        </View>

        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}

        {/* Presupuesto / Ejecutado / Disponible */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Presupuesto</Text>
            <Text style={styles.metaValue}>{money(budget)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Ejecutado</Text>
            <Text style={styles.metaValue}>{money(spent)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Disponible</Text>
            <Text
              style={{
                ...styles.metaValue,
                color: available < 0 ? C.red : C.deepGreen,
              }}
            >
              {money(available)}
            </Text>
          </View>
        </View>

        {/* Fechas */}
        <View style={styles.datesRow}>
          <View>
            <Text style={styles.dateLabel}>Inicio</Text>
            <Text style={styles.dateValue}>{fmtDate(startDate)}</Text>
          </View>
          <View>
            <Text style={styles.dateLabel}>Fin</Text>
            <Text style={styles.dateValue}>{fmtDate(endDate)}</Text>
          </View>
          <View>
            <Text style={styles.dateLabel}>Creada</Text>
            <Text style={styles.dateValue}>{fmtDate(createdAt)}</Text>
          </View>
        </View>

        {/* Desglose de items */}
        <Text style={styles.sectionTitle}>Desglose de costos</Text>
        {validItems.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={{ ...styles.tableHeaderCell, flex: 3 }}>Concepto</Text>
              <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: "right" }}>
                Monto
              </Text>
            </View>
            {validItems.map((it, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={{ ...styles.tableCell, flex: 3 }}>
                  {it.label || "—"}
                </Text>
                <Text style={{ ...styles.tableCell, flex: 1, textAlign: "right" }}>
                  {money(it.amount || 0)}
                </Text>
              </View>
            ))}
            <View style={styles.tableTotalRow}>
              <Text style={{ ...styles.tableTotalCell, flex: 3 }}>Total desglosado</Text>
              <Text
                style={{ ...styles.tableTotalCell, flex: 1, textAlign: "right" }}
              >
                {money(itemsTotal)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.noItems}>Sin desglose de costos cargado.</Text>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Confidencial · Dearmas & Costantini · {today}
          </Text>
          <Text style={styles.footerText}>{clientName}</Text>
        </View>
      </Page>
    </Document>
  );
}
