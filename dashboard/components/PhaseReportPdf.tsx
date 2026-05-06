"use client";

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  Link,
} from "@react-pdf/renderer";
import {
  parseMarkdownBlocks,
  type Block,
  type InlineSpan,
} from "@/lib/markdown-blocks";

// ====== FONTS ======
// Usamos Helvetica (built-in en react-pdf, no requiere fetch). Es
// visualmente casi idéntica a Inter para nuestros tamaños de body
// y es la fuente histórica del brand book de DC. Cero red, cero
// puntos de falla.
const FONT_REGULAR = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_OBLIQUE = "Helvetica-Oblique";

// Hyphenation callback custom para que no parta palabras raras en
// rioplatense (ej: "marketing" en "mar-ke-ting").
Font.registerHyphenationCallback((w) => [w]);

// ====== BRAND COLORS ======
const C = {
  deepGreen: "#0A1A0C",
  forest: "#1E3A28",
  sand: "#C4A882",
  sandDark: "#9B8259",
  offWhite: "#E8E4DC",
  ivory: "#F5F2EC",
  textMuted: "#7A8A7E",
  redWarn: "#B04B3A",
  greenOk: "#3A8B5C",
};

const A4 = { width: 595, height: 842 };

// ====== STYLES ======
const styles = StyleSheet.create({
  // ===== Cover =====
  cover: {
    backgroundColor: C.deepGreen,
    color: C.offWhite,
    padding: 56,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  coverTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  coverLockup: {
    flexDirection: "column",
  },
  coverDearmas: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 24,
    letterSpacing: -0.5,
    color: C.offWhite,
  },
  coverCostantini: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 24,
    letterSpacing: -0.5,
    color: C.offWhite,
    opacity: 0.55,
    marginTop: -2,
  },
  coverTagline: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 8,
    letterSpacing: 2,
    color: C.sand,
    marginTop: 14,
    textTransform: "uppercase",
  },
  clientLogoBox: {
    alignItems: "flex-end",
    maxWidth: 140,
  },
  clientLogo: {
    maxWidth: 140,
    maxHeight: 70,
    objectFit: "contain",
  },
  clientName: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 11,
    letterSpacing: 1.5,
    color: C.sand,
    marginTop: 8,
    textTransform: "uppercase",
    textAlign: "right",
  },
  coverDivider: {
    width: 80,
    height: 2,
    backgroundColor: C.sand,
    marginVertical: 32,
  },
  coverEyebrow: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 10,
    letterSpacing: 3,
    color: C.sand,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  coverTitle: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 56,
    letterSpacing: -2,
    color: C.offWhite,
    lineHeight: 1.05,
  },
  coverSubtitle: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 16,
    color: C.sand,
    marginTop: 16,
    letterSpacing: -0.3,
  },
  coverMetaGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(196,168,130,0.25)",
    borderTopStyle: "solid",
  },
  coverMetaCell: {
    flexDirection: "column",
    flex: 1,
  },
  coverMetaLabel: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 8,
    letterSpacing: 2,
    color: C.sand,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  coverMetaValue: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 11,
    color: C.offWhite,
  },

  // ===== Content pages =====
  contentPage: {
    backgroundColor: "#FFFFFF",
    padding: 0,
    paddingTop: 56,
    paddingBottom: 56,
  },
  contentInner: {
    paddingHorizontal: 56,
  },
  // Header de cada página
  pageHeader: {
    position: "absolute",
    top: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.sand,
    borderBottomStyle: "solid",
  },
  pageHeaderLockup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  pageHeaderDearmas: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 9,
    color: C.deepGreen,
    letterSpacing: -0.2,
  },
  pageHeaderCostantini: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 9,
    color: C.deepGreen,
    opacity: 0.55,
    letterSpacing: -0.2,
  },
  pageHeaderRight: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 8,
    color: C.sandDark,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  // Footer de cada página
  pageFooter: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 0.3,
    borderTopColor: C.deepGreen,
    borderTopStyle: "solid",
  },
  pageFooterText: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 8,
    color: C.textMuted,
  },

  // ===== Typography =====
  h1: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 24,
    letterSpacing: -0.6,
    color: C.deepGreen,
    marginTop: 28,
    marginBottom: 12,
  },
  h2: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 16,
    letterSpacing: -0.4,
    color: C.deepGreen,
    marginTop: 24,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(10,26,12,0.12)",
    borderBottomStyle: "solid",
  },
  h3: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 12,
    letterSpacing: 1.5,
    color: C.sandDark,
    marginTop: 18,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  h4: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 11,
    color: C.deepGreen,
    marginTop: 14,
    marginBottom: 4,
  },
  paragraph: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 10,
    color: C.deepGreen,
    lineHeight: 1.55,
    marginBottom: 6,
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 3,
    marginLeft: 0,
  },
  bulletMarker: {
    width: 16,
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 10,
    color: C.sandDark,
    lineHeight: 1.55,
  },
  bulletText: {
    flex: 1,
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 10,
    color: C.deepGreen,
    lineHeight: 1.55,
  },
  hr: {
    height: 0.5,
    backgroundColor: "rgba(10,26,12,0.12)",
    marginVertical: 16,
  },
  blockquote: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: C.sand,
    borderLeftStyle: "solid",
    marginVertical: 10,
  },
  blockquoteText: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 10,
    fontStyle: "italic",
    color: C.textMuted,
    lineHeight: 1.55,
  },

  // ===== TOC (Index) =====
  tocPage: {
    backgroundColor: "#FFFFFF",
    padding: 0,
    paddingTop: 56,
    paddingBottom: 56,
  },
  tocInner: {
    paddingHorizontal: 56,
  },
  tocEyebrow: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 9,
    letterSpacing: 2,
    color: C.sandDark,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  tocTitle: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 36,
    letterSpacing: -1,
    color: C.deepGreen,
    marginBottom: 8,
    lineHeight: 1.05,
  },
  tocSubtitle: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 36,
  },
  tocDivider: {
    width: 60,
    height: 2,
    backgroundColor: C.sand,
    marginBottom: 28,
  },
  tocList: {
    flexDirection: "column",
  },
  tocItem: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 9,
    borderBottomWidth: 0.3,
    borderBottomColor: "rgba(10,26,12,0.10)",
    borderBottomStyle: "solid",
  },
  tocNumber: {
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 11,
    color: C.sandDark,
    width: 32,
    letterSpacing: 0.5,
  },
  tocLabel: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 12,
    color: C.deepGreen,
    flex: 1,
    paddingRight: 16,
  },
  tocPageNumberPlaceholder: {
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 9,
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // ===== Tables =====
  table: {
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: "rgba(10,26,12,0.18)",
    borderStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(10,26,12,0.10)",
    borderBottomStyle: "solid",
  },
  tableRowHeader: {
    flexDirection: "row",
    backgroundColor: C.deepGreen,
  },
  tableCell: {
    padding: 6,
    fontFamily: FONT_REGULAR,
    fontWeight: "normal",
    fontSize: 9,
    color: C.deepGreen,
    flex: 1,
  },
  tableCellHeader: {
    padding: 6,
    fontFamily: FONT_REGULAR,
    fontWeight: "bold",
    fontSize: 9,
    color: C.offWhite,
    flex: 1,
    letterSpacing: 0.5,
  },
});

// ====== Inline span renderer ======
function renderSpans(spans: InlineSpan[]) {
  return spans.map((s, idx) => {
    if (s.type === "text") return <Text key={idx}>{s.text}</Text>;
    if (s.type === "bold")
      return (
        <Text key={idx} style={{ fontFamily: FONT_BOLD }}>
          {s.text}
        </Text>
      );
    if (s.type === "italic")
      return (
        <Text key={idx} style={{ fontFamily: FONT_OBLIQUE }}>
          {s.text}
        </Text>
      );
    if (s.type === "link")
      return (
        <Link
          key={idx}
          src={s.href}
          style={{
            color: C.sandDark,
            textDecoration: "underline",
          }}
        >
          {s.text}
        </Link>
      );
    if (s.type === "code")
      return (
        <Text
          key={idx}
          style={{
            fontFamily: "Courier",
            fontSize: 9,
            backgroundColor: C.offWhite,
            paddingHorizontal: 3,
          }}
        >
          {s.text}
        </Text>
      );
    return null;
  });
}

function renderBlock(block: Block, idx: number): React.ReactElement | null {
  switch (block.type) {
    case "h1":
      return (
        <Text key={idx} style={styles.h1}>
          {renderSpans(block.spans)}
        </Text>
      );
    case "h2":
      return (
        <Text key={idx} style={styles.h2}>
          {renderSpans(block.spans)}
        </Text>
      );
    case "h3":
      return (
        <Text key={idx} style={styles.h3}>
          {renderSpans(block.spans)}
        </Text>
      );
    case "h4":
      return (
        <Text key={idx} style={styles.h4}>
          {renderSpans(block.spans)}
        </Text>
      );
    case "paragraph":
      return (
        <Text key={idx} style={styles.paragraph}>
          {renderSpans(block.spans)}
        </Text>
      );
    case "bullet":
      return (
        <View
          key={idx}
          style={{
            ...styles.bullet,
            marginLeft: block.level * 14,
          }}
        >
          <Text style={styles.bulletMarker}>•</Text>
          <Text style={styles.bulletText}>{renderSpans(block.spans)}</Text>
        </View>
      );
    case "ordered":
      return (
        <View
          key={idx}
          style={{
            ...styles.bullet,
            marginLeft: block.level * 14,
          }}
        >
          <Text style={styles.bulletMarker}>{block.index}.</Text>
          <Text style={styles.bulletText}>{renderSpans(block.spans)}</Text>
        </View>
      );
    case "table":
      return (
        <View key={idx} style={styles.table}>
          {block.rows.map((row, rIdx) => {
            const isHeader = rIdx === 0 && block.hasHeader;
            return (
              <View
                key={rIdx}
                style={isHeader ? styles.tableRowHeader : styles.tableRow}
              >
                {row.map((cell, cIdx) => (
                  <Text
                    key={cIdx}
                    style={isHeader ? styles.tableCellHeader : styles.tableCell}
                  >
                    {renderSpans(cell)}
                  </Text>
                ))}
              </View>
            );
          })}
        </View>
      );
    case "hr":
      return <View key={idx} style={styles.hr} />;
    case "blockquote":
      return (
        <View key={idx} style={styles.blockquote}>
          <Text style={styles.blockquoteText}>{renderSpans(block.spans)}</Text>
        </View>
      );
    case "spacer":
      return <View key={idx} style={{ height: 6 }} />;
    default:
      return null;
  }
}

// ====== Main Document ======
export interface PhaseReportPdfProps {
  phaseLabel: string;        // "Diagnóstico", "Estrategia", etc
  reportName: string;        // "Growth Diagnosis Plan"
  clientName: string;
  clientLogoUrl?: string | null;  // signed URL
  generatedAt: string | null;
  approvedAt: string | null;
  version: number;
  contentMd: string;
}

// Extrae los headings H2 del contenido para listar el TOC.
// Solo agarra blocks con type='h2' que es el nivel de las secciones
// principales del reporte (## 1. Executive Summary, etc).
function extractTocEntries(blocks: Block[]): { number: string; title: string }[] {
  const entries: { number: string; title: string }[] = [];
  for (const block of blocks) {
    if (block.type !== "h2") continue;
    // El texto crudo del heading lo armamos concatenando los spans
    const raw = block.spans.map((s) => ("text" in s ? s.text : "")).join("");
    // Headings vienen como "1. Executive Summary" — parseamos el número
    const m = raw.match(/^\s*(\d+)\.\s*(.+?)\s*$/);
    if (m) {
      entries.push({
        number: m[1].padStart(2, "0"),
        title: m[2],
      });
    } else {
      entries.push({ number: "·", title: raw });
    }
  }
  return entries;
}

export default function PhaseReportPdf({
  phaseLabel,
  reportName,
  clientName,
  clientLogoUrl,
  generatedAt,
  approvedAt,
  version,
  contentMd,
}: PhaseReportPdfProps) {
  const blocks = parseMarkdownBlocks(contentMd);
  const tocEntries = extractTocEntries(blocks);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const today = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Document
      title={`${phaseLabel} · ${clientName}`}
      author="Dearmas Costantini"
      subject={reportName}
      creator="Dearmas Costantini Scale"
      producer="Dearmas Costantini Scale"
    >
      {/* ============ COVER ============ */}
      <Page size="A4" style={styles.cover}>
        {/* Top: lockup DC + logo cliente */}
        <View style={styles.coverTopRow}>
          <View style={styles.coverLockup}>
            <Text style={styles.coverDearmas}>Dearmas</Text>
            <Text style={styles.coverCostantini}>Costantini</Text>
            <Text style={styles.coverTagline}>
              Business Growth Partners · LATAM
            </Text>
          </View>
          {clientLogoUrl && (
            <View style={styles.clientLogoBox}>
              <Image src={clientLogoUrl} style={styles.clientLogo} />
              <Text style={styles.clientName}>{clientName}</Text>
            </View>
          )}
          {!clientLogoUrl && (
            <View style={styles.clientLogoBox}>
              <Text style={styles.clientName}>{clientName}</Text>
            </View>
          )}
        </View>

        {/* Mid: título grande */}
        <View>
          <View style={styles.coverDivider} />
          <Text style={styles.coverEyebrow}>Reporte de fase del onboarding</Text>
          <Text style={styles.coverTitle}>{phaseLabel}</Text>
          <Text style={styles.coverSubtitle}>{reportName}</Text>
        </View>

        {/* Bottom: meta */}
        <View style={styles.coverMetaGrid}>
          <View style={styles.coverMetaCell}>
            <Text style={styles.coverMetaLabel}>Cliente</Text>
            <Text style={styles.coverMetaValue}>{clientName}</Text>
          </View>
          <View style={styles.coverMetaCell}>
            <Text style={styles.coverMetaLabel}>Generado</Text>
            <Text style={styles.coverMetaValue}>{fmtDate(generatedAt)}</Text>
          </View>
          <View style={styles.coverMetaCell}>
            <Text style={styles.coverMetaLabel}>
              {approvedAt ? "Aprobado" : "Estado"}
            </Text>
            <Text style={styles.coverMetaValue}>
              {approvedAt ? fmtDate(approvedAt) : "Borrador"}
            </Text>
          </View>
          <View style={styles.coverMetaCell}>
            <Text style={styles.coverMetaLabel}>Versión</Text>
            <Text style={styles.coverMetaValue}>v{version}</Text>
          </View>
        </View>
      </Page>

      {/* ============ CONTENT ============ */}
      <Page size="A4" style={styles.contentPage}>
        {/* Header repetido en cada página */}
        <View style={styles.pageHeader} fixed>
          <View style={styles.pageHeaderLockup}>
            <Text style={styles.pageHeaderDearmas}>Dearmas</Text>
            <Text style={styles.pageHeaderCostantini}>Costantini</Text>
          </View>
          <Text style={styles.pageHeaderRight}>
            {phaseLabel} · {clientName}
          </Text>
        </View>

        {/* Footer fixed */}
        <View style={styles.pageFooter} fixed>
          <Text style={styles.pageFooterText}>
            Confidencial · Dearmas Costantini · {today}
          </Text>
          <Text
            style={styles.pageFooterText}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>

        {/* Contenido */}
        <View style={styles.contentInner}>
          {blocks.map((block, idx) => renderBlock(block, idx))}
        </View>
      </Page>
    </Document>
  );
}
