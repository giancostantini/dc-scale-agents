"use client";

/**
 * DividendActaPdf — acta en PDF de una distribución de dividendos.
 *
 * Una página A4 con:
 *   1. Estado de resultados del mes (P&L): ingresos y egresos que
 *      componen el resultado neto — el "cómo se calculó".
 *   2. Distribución del neto entre socios / inversiones / back.
 *
 * Para los reajustes (seq>=1) se omite el P&L completo del mes (que
 * sería engañoso) y se muestra solo la diferencia repartida.
 *
 * Estilo de marca (Brand Board 2026) igual que el resto de los PDFs.
 * Se genera client-side con `pdf(<DividendActaPdf .../>).toBlob()`.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

const FONT_REGULAR = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

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
  navy: "#1E3A8A",
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
    marginBottom: 20,
  },
  title: {
    fontFamily: FONT_BOLD,
    fontSize: 24,
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

  sectionTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    letterSpacing: 1.6,
    color: C.sandDark,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 8,
  },

  // Filas de P&L (concepto ... monto)
  pnlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: C.hairlineSoft,
    borderBottomStyle: "solid",
  },
  pnlLabel: {
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    color: C.textSoft,
    flexShrink: 1,
    paddingRight: 10,
  },
  pnlAmount: {
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    color: C.deepGreen,
    textAlign: "right",
  },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginBottom: 4,
  },
  subtotalLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 9.5,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: C.sandDark,
  },
  subtotalAmount: {
    fontFamily: FONT_BOLD,
    fontSize: 10.5,
    color: C.deepGreen,
    textAlign: "right",
  },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.bone,
    borderWidth: 0.6,
    borderColor: C.hairline,
    borderStyle: "solid",
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  netLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: C.deepGreen,
  },
  netAmount: {
    fontFamily: FONT_BOLD,
    fontSize: 17,
    letterSpacing: -0.3,
  },
  noItems: {
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    color: C.textMuted,
    fontStyle: "italic",
    marginBottom: 6,
  },

  // Tabla de distribución
  table: {
    borderWidth: 0.6,
    borderColor: C.hairline,
    borderStyle: "solid",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeaderRow: { flexDirection: "row", backgroundColor: C.deepGreen },
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
  tableTotalRow: { flexDirection: "row", backgroundColor: C.offWhite },
  tableTotalCell: {
    padding: 8,
    fontFamily: FONT_BOLD,
    fontSize: 10,
    color: C.deepGreen,
  },
  reajusteNote: {
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    color: C.textSoft,
    lineHeight: 1.6,
    marginBottom: 20,
    backgroundColor: "rgba(30,58,138,0.05)",
    borderLeftWidth: 3,
    borderLeftColor: C.navy,
    borderLeftStyle: "solid",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },

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

export interface ActaLine {
  label: string;
  amount: number;
}

export interface DividendActaRow {
  label: string;
  pct: number;
  amount: number;
}

export interface DividendActaPdfProps {
  monthLabel: string;
  currencyCode: string; // "USD" | "UYU"
  symbol: string; // "USD" | "$U"
  estado: "pagada" | "pendiente";
  isReajuste: boolean;
  reajusteLabel?: string | null;
  ingresos: ActaLine[];
  egresos: ActaLine[];
  totalIngresos: number;
  totalEgresos: number;
  net: number;
  distribucion: DividendActaRow[];
  totalDistribuido: number;
  saldoDisponible: number;
}

export default function DividendActaPdf({
  monthLabel,
  currencyCode,
  symbol,
  estado,
  isReajuste,
  reajusteLabel,
  ingresos,
  egresos,
  totalIngresos,
  totalEgresos,
  net,
  distribucion,
  totalDistribuido,
  saldoDisponible,
}: DividendActaPdfProps) {
  const money = (n: number): string => {
    const sign = n < 0 ? "−" : "";
    return `${sign}${symbol} ${Math.abs(Math.round(n)).toLocaleString("es-AR")}`;
  };
  const today = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Document
      title={`Acta de distribución · ${monthLabel} · ${currencyCode}`}
      author="Dearmas & Costantini"
      subject={`Acta de distribución de dividendos — ${monthLabel}`}
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
            <Text style={styles.headerEyebrow}>Acta de distribución</Text>
            <Text style={styles.headerClient}>
              {monthLabel} · {currencyCode}
            </Text>
          </View>
        </View>

        {/* Título + estado */}
        <Text style={styles.typeEyebrow}>
          {isReajuste ? "Reajuste de distribución" : "Distribución de dividendos"}
        </Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {isReajuste ? reajusteLabel || "Reajuste" : `Ejercicio ${monthLabel}`}
          </Text>
          <Text
            style={{
              ...styles.statusPill,
              backgroundColor:
                estado === "pagada"
                  ? "rgba(47,125,79,0.14)"
                  : "rgba(196,168,130,0.18)",
              color: estado === "pagada" ? C.green : C.sandDark,
            }}
          >
            {estado === "pagada" ? "Pagada" : "Pendiente"}
          </Text>
        </View>

        {isReajuste ? (
          <Text style={styles.reajusteNote}>
            Este reajuste reparte únicamente la diferencia detectada en el
            resultado de {monthLabel} después de haberse pagado la distribución
            original — por movimientos (ingresos o egresos) cargados con
            posterioridad al cierre. La distribución original no se modifica.
          </Text>
        ) : (
          <>
            {/* ===== P&L: cómo se calculó el neto ===== */}
            <Text style={styles.sectionTitle}>Ingresos del mes</Text>
            {ingresos.length > 0 ? (
              ingresos.map((it, i) => (
                <View key={i} style={styles.pnlRow}>
                  <Text style={styles.pnlLabel}>{it.label}</Text>
                  <Text style={styles.pnlAmount}>{money(it.amount)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noItems}>Sin ingresos registrados en el mes.</Text>
            )}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Total ingresos</Text>
              <Text style={styles.subtotalAmount}>{money(totalIngresos)}</Text>
            </View>

            <Text style={styles.sectionTitle}>Egresos del mes</Text>
            {egresos.length > 0 ? (
              egresos.map((it, i) => (
                <View key={i} style={styles.pnlRow}>
                  <Text style={styles.pnlLabel}>{it.label}</Text>
                  <Text style={styles.pnlAmount}>−{money(it.amount)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noItems}>Sin egresos registrados en el mes.</Text>
            )}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Total egresos</Text>
              <Text style={styles.subtotalAmount}>−{money(totalEgresos)}</Text>
            </View>
          </>
        )}

        {/* Resultado neto */}
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>
            {isReajuste ? "Diferencia a distribuir" : "Resultado neto del ejercicio"}
          </Text>
          <Text
            style={{
              ...styles.netAmount,
              color: net < 0 ? C.red : C.deepGreen,
            }}
          >
            {money(net)}
          </Text>
        </View>

        {/* ===== Distribución del neto ===== */}
        <Text style={styles.sectionTitle}>Distribución del resultado</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={{ ...styles.tableHeaderCell, flex: 3 }}>Concepto</Text>
            <Text style={{ ...styles.tableHeaderCell, flex: 1, textAlign: "right" }}>
              %
            </Text>
            <Text style={{ ...styles.tableHeaderCell, flex: 1.4, textAlign: "right" }}>
              Importe
            </Text>
          </View>
          {distribucion.map((d, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={{ ...styles.tableCell, flex: 3 }}>{d.label}</Text>
              <Text style={{ ...styles.tableCell, flex: 1, textAlign: "right" }}>
                {d.pct}%
              </Text>
              <Text style={{ ...styles.tableCell, flex: 1.4, textAlign: "right" }}>
                {money(d.amount)}
              </Text>
            </View>
          ))}
          <View style={styles.tableTotalRow}>
            <Text style={{ ...styles.tableTotalCell, flex: 3 }}>Total distribuido a socios</Text>
            <Text style={{ ...styles.tableTotalCell, flex: 1, textAlign: "right" }}>
              {""}
            </Text>
            <Text style={{ ...styles.tableTotalCell, flex: 1.4, textAlign: "right" }}>
              {money(totalDistribuido)}
            </Text>
          </View>
          <View style={styles.tableTotalRow}>
            <Text style={{ ...styles.tableTotalCell, flex: 3 }}>Saldo disponible (empresa)</Text>
            <Text style={{ ...styles.tableTotalCell, flex: 1, textAlign: "right" }}>
              {""}
            </Text>
            <Text style={{ ...styles.tableTotalCell, flex: 1.4, textAlign: "right" }}>
              {money(saldoDisponible)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Confidencial · Dearmas & Costantini · {today}
          </Text>
          <Text style={styles.footerText}>
            Acta {monthLabel} · {currencyCode}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
