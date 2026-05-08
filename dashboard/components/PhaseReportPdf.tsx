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
// Helvetica built-in en react-pdf — cero red, cero fetch.
// IMPORTANTE: usamos los nombres EXACTOS de los fonts cuando queremos
// negrita o itálica (en vez de combinar fontFamily=Helvetica + fontWeight=bold).
// react-pdf no registra automáticamente las variantes y el font-resolver
// puede fallar feo cuando además se hereda fontStyle del padre. Pegándole
// directo al nombre del font built-in nunca falla.
const FONT_REGULAR = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_OBLIQUE = "Helvetica-Oblique";

// Hyphenation custom: no partir palabras (en rioplatense queda raro).
Font.registerHyphenationCallback((w) => [w]);

// ====== BRAND COLORS ======
// Brand Board 2026. Deep green editorial + acentos sand.
const C = {
  deepGreen: "#0A1A0C",
  forest: "#1E3A28",
  sand: "#C4A882",
  sandDark: "#9B8259",
  sandLight: "#E8DFD0",
  offWhite: "#E8E4DC",
  ivory: "#F5F2EC",
  bone: "#FAF8F3",
  textMuted: "#7A8A7E",
  textSoft: "#5A6A5E",
  hairline: "rgba(10,26,12,0.10)",
  hairlineSoft: "rgba(10,26,12,0.06)",
};

// ====== STYLES ======
const styles = StyleSheet.create({
  // ============ COVER ============
  cover: {
    backgroundColor: C.deepGreen,
    padding: 56,
    flexDirection: "column",
    justifyContent: "space-between",
  },

  // Top row: DC lockup left, client logo+name right
  coverTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  coverLockup: {
    flexDirection: "column",
  },
  coverDearmas: {
    fontFamily: FONT_BOLD,
    fontSize: 22,
    letterSpacing: -0.4,
    color: C.bone,
    lineHeight: 1.0,
  },
  coverCostantini: {
    fontFamily: FONT_REGULAR,
    fontSize: 22,
    letterSpacing: -0.4,
    color: C.sand,
    lineHeight: 1.0,
    marginTop: 1,
  },
  coverTagline: {
    fontFamily: FONT_BOLD,
    fontSize: 7.5,
    letterSpacing: 2.4,
    color: C.sand,
    marginTop: 16,
    textTransform: "uppercase",
  },

  clientLogoBox: {
    alignItems: "flex-end",
    maxWidth: 140,
  },
  clientLogo: {
    maxWidth: 140,
    maxHeight: 60,
    objectFit: "contain",
  },
  clientName: {
    fontFamily: FONT_BOLD,
    fontSize: 9,
    letterSpacing: 1.8,
    color: C.sand,
    marginTop: 10,
    textTransform: "uppercase",
    textAlign: "right",
  },

  // Mid: title block
  coverTitleBlock: {
    flexDirection: "column",
  },
  coverDivider: {
    width: 64,
    height: 1.5,
    backgroundColor: C.sand,
    marginBottom: 28,
  },
  coverEyebrow: {
    fontFamily: FONT_BOLD,
    fontSize: 9,
    letterSpacing: 3,
    color: C.sand,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  coverTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 64,
    letterSpacing: -2.4,
    color: C.bone,
    lineHeight: 1.0,
  },
  coverSubtitle: {
    fontFamily: FONT_REGULAR,
    fontSize: 15,
    color: C.sand,
    marginTop: 18,
    letterSpacing: -0.2,
  },

  // Bottom: meta grid
  coverMetaGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 22,
    borderTopWidth: 0.6,
    borderTopColor: "rgba(196,168,130,0.35)",
    borderTopStyle: "solid",
  },
  coverMetaCell: {
    flexDirection: "column",
    flex: 1,
  },
  coverMetaLabel: {
    fontFamily: FONT_BOLD,
    fontSize: 7.5,
    letterSpacing: 2,
    color: C.sand,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  coverMetaValue: {
    fontFamily: FONT_REGULAR,
    fontSize: 11,
    color: C.bone,
    letterSpacing: -0.1,
  },

  // ============ CONTENT PAGES ============
  contentPage: {
    backgroundColor: "#FFFFFF",
    paddingTop: 64,
    paddingBottom: 56,
  },
  contentInner: {
    paddingHorizontal: 60,
  },

  // Header (fixed) — minimal lockup + section
  pageHeader: {
    position: "absolute",
    top: 28,
    left: 60,
    right: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 0.4,
    borderBottomColor: C.hairline,
    borderBottomStyle: "solid",
  },
  pageHeaderLockup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  pageHeaderDearmas: {
    fontFamily: FONT_BOLD,
    fontSize: 8.5,
    color: C.deepGreen,
    letterSpacing: -0.1,
  },
  pageHeaderCostantini: {
    fontFamily: FONT_REGULAR,
    fontSize: 8.5,
    color: C.sandDark,
    letterSpacing: -0.1,
  },
  pageHeaderRight: {
    fontFamily: FONT_BOLD,
    fontSize: 7.5,
    color: C.sandDark,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },

  // Footer (fixed)
  pageFooter: {
    position: "absolute",
    bottom: 28,
    left: 60,
    right: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 0.3,
    borderTopColor: C.hairlineSoft,
    borderTopStyle: "solid",
  },
  pageFooterText: {
    fontFamily: FONT_REGULAR,
    fontSize: 7.5,
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  pageFooterPageNum: {
    fontFamily: FONT_BOLD,
    fontSize: 7.5,
    color: C.sandDark,
    letterSpacing: 1.2,
  },

  // ===== Typography =====
  h1: {
    fontFamily: FONT_BOLD,
    fontSize: 22,
    letterSpacing: -0.5,
    color: C.deepGreen,
    marginTop: 24,
    marginBottom: 12,
    lineHeight: 1.15,
  },
  h2: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    letterSpacing: -0.4,
    color: C.deepGreen,
    marginTop: 0,
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.sand,
    borderBottomStyle: "solid",
    lineHeight: 1.2,
  },
  h2Eyebrow: {
    fontFamily: FONT_BOLD,
    fontSize: 8,
    letterSpacing: 2.5,
    color: C.sandDark,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  h3: {
    fontFamily: FONT_BOLD,
    fontSize: 11,
    letterSpacing: 1.4,
    color: C.sandDark,
    marginTop: 16,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  h4: {
    fontFamily: FONT_BOLD,
    fontSize: 11,
    color: C.deepGreen,
    marginTop: 12,
    marginBottom: 4,
  },
  paragraph: {
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    color: C.deepGreen,
    lineHeight: 1.6,
    marginBottom: 8,
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 4,
    marginLeft: 0,
  },
  bulletMarker: {
    width: 14,
    fontFamily: FONT_BOLD,
    fontSize: 10,
    color: C.sandDark,
    lineHeight: 1.6,
  },
  bulletText: {
    flex: 1,
    fontFamily: FONT_REGULAR,
    fontSize: 10,
    color: C.deepGreen,
    lineHeight: 1.6,
  },
  hr: {
    height: 0.4,
    backgroundColor: C.hairline,
    marginVertical: 18,
  },
  blockquote: {
    paddingLeft: 14,
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: C.sand,
    borderLeftStyle: "solid",
    marginVertical: 12,
  },
  blockquoteText: {
    fontFamily: FONT_OBLIQUE,
    fontSize: 10,
    color: C.textSoft,
    lineHeight: 1.6,
  },

  // ============ TOC (page 2) ============
  tocPage: {
    backgroundColor: "#FFFFFF",
    paddingTop: 64,
    paddingBottom: 56,
  },
  tocInner: {
    paddingHorizontal: 60,
  },
  tocEyebrow: {
    fontFamily: FONT_BOLD,
    fontSize: 9,
    letterSpacing: 3,
    color: C.sandDark,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  tocTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 44,
    letterSpacing: -1.4,
    color: C.deepGreen,
    marginBottom: 12,
    lineHeight: 1.0,
  },
  tocSubtitle: {
    fontFamily: FONT_REGULAR,
    fontSize: 11.5,
    color: C.textSoft,
    marginBottom: 32,
    letterSpacing: -0.1,
    lineHeight: 1.4,
  },
  tocDivider: {
    width: 64,
    height: 1.5,
    backgroundColor: C.sand,
    marginBottom: 32,
  },
  tocList: {
    flexDirection: "column",
  },
  tocItem: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingVertical: 11,
    borderBottomWidth: 0.4,
    borderBottomColor: C.hairlineSoft,
    borderBottomStyle: "solid",
  },
  tocNumber: {
    fontFamily: FONT_BOLD,
    fontSize: 11,
    color: C.sandDark,
    width: 36,
    letterSpacing: 1,
  },
  tocLabel: {
    fontFamily: FONT_REGULAR,
    fontSize: 12,
    color: C.deepGreen,
    flex: 1,
    paddingRight: 12,
    letterSpacing: -0.1,
  },

  // ============ TABLES ============
  table: {
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 0.4,
    borderColor: C.hairline,
    borderStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: C.hairlineSoft,
    borderBottomStyle: "solid",
  },
  tableRowHeader: {
    flexDirection: "row",
    backgroundColor: C.deepGreen,
  },
  tableCell: {
    padding: 7,
    fontFamily: FONT_REGULAR,
    fontSize: 9,
    color: C.deepGreen,
    flex: 1,
    lineHeight: 1.45,
  },
  tableCellHeader: {
    padding: 7,
    fontFamily: FONT_BOLD,
    fontSize: 8,
    color: C.bone,
    flex: 1,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});

// ====== Inline span renderer ======
function renderSpans(spans: InlineSpan[]) {
  return spans.map((s, idx) => {
    if (s.type === "text") return <Text key={idx}>{s.text}</Text>;
    if (s.type === "bold")
      // Apuntamos directo al font built-in Helvetica-Bold y reseteamos
      // fontStyle a normal para no heredar italic del padre (el built-in
      // no tiene variante italic).
      return (
        <Text
          key={idx}
          style={{ fontFamily: FONT_BOLD, fontStyle: "normal" }}
        >
          {s.text}
        </Text>
      );
    if (s.type === "italic")
      return (
        <Text
          key={idx}
          style={{ fontFamily: FONT_OBLIQUE, fontStyle: "italic" }}
        >
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
            backgroundColor: C.ivory,
            paddingHorizontal: 3,
          }}
        >
          {s.text}
        </Text>
      );
    return null;
  });
}

// Para renderizar el H2 con eyebrow numérico, sacamos el número
// de la sección del texto (ej: "1. Resumen ejecutivo" → number=1, title=Resumen ejecutivo)
function splitH2(spans: InlineSpan[]): { number: string | null; titleSpans: InlineSpan[] } {
  const raw = spans.map((s) => ("text" in s ? s.text : "")).join("");
  const m = raw.match(/^\s*(\d+)\.\s*(.+?)\s*$/);
  if (!m) return { number: null, titleSpans: spans };
  // Reemplazamos el primer span (que tiene el número) con uno que solo
  // tiene el título limpio. Si era todo un solo "text" span, listo.
  // Si los spans estaban mezclados conservamos los siguientes spans.
  const titleText = m[2];
  const newFirst: InlineSpan = { type: "text", text: titleText };
  // Si solo había un span de texto, devolvemos eso
  if (spans.length === 1 && spans[0].type === "text") {
    return { number: m[1].padStart(2, "0"), titleSpans: [newFirst] };
  }
  // Caso mezclado: simplificamos al texto plano para no romper formato
  return { number: m[1].padStart(2, "0"), titleSpans: [newFirst] };
}

function renderBlock(
  block: Block,
  idx: number,
  isFirstH2: boolean = false,
): React.ReactElement | null {
  switch (block.type) {
    case "h1":
      return (
        <Text key={idx} style={styles.h1}>
          {renderSpans(block.spans)}
        </Text>
      );
    case "h2": {
      // Cada H2 después del primero arranca en página nueva.
      const { number, titleSpans } = splitH2(block.spans);
      return (
        <View key={idx} break={!isFirstH2} wrap={false}>
          {number && <Text style={styles.h2Eyebrow}>Sección {number}</Text>}
          <Text style={styles.h2}>{renderSpans(titleSpans)}</Text>
        </View>
      );
    }
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
  clientLogoUrl?: string | null;  // signed URL (data URL preferido)
  generatedAt: string | null;
  approvedAt: string | null;
  version: number;
  contentMd: string;
}

// Extrae los headings H2 del contenido para listar el TOC.
function extractTocEntries(blocks: Block[]): { number: string; title: string }[] {
  const entries: { number: string; title: string }[] = [];
  for (const block of blocks) {
    if (block.type !== "h2") continue;
    const raw = block.spans.map((s) => ("text" in s ? s.text : "")).join("");
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
          {clientLogoUrl ? (
            <View style={styles.clientLogoBox}>
              <Image src={clientLogoUrl} style={styles.clientLogo} />
              <Text style={styles.clientName}>{clientName}</Text>
            </View>
          ) : (
            <View style={styles.clientLogoBox}>
              <Text style={styles.clientName}>{clientName}</Text>
            </View>
          )}
        </View>

        {/* Mid: título */}
        <View style={styles.coverTitleBlock}>
          <View style={styles.coverDivider} />
          <Text style={styles.coverEyebrow}>Reporte de fase · onboarding</Text>
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

      {/* ============ TOC ============ */}
      {tocEntries.length > 0 && (
        <Page size="A4" style={styles.tocPage}>
          <View style={styles.pageHeader} fixed>
            <View style={styles.pageHeaderLockup}>
              <Text style={styles.pageHeaderDearmas}>Dearmas</Text>
              <Text style={styles.pageHeaderCostantini}>Costantini</Text>
            </View>
            <Text style={styles.pageHeaderRight}>
              {phaseLabel} · {clientName}
            </Text>
          </View>

          <View style={styles.pageFooter} fixed>
            <Text style={styles.pageFooterText}>
              Confidencial · Dearmas Costantini · {today}
            </Text>
            <Text
              style={styles.pageFooterPageNum}
              render={({ pageNumber, totalPages }) =>
                `${pageNumber} / ${totalPages}`
              }
            />
          </View>

          <View style={styles.tocInner}>
            <Text style={styles.tocEyebrow}>Tabla de contenidos</Text>
            <Text style={styles.tocTitle}>Índice</Text>
            <Text style={styles.tocSubtitle}>
              {tocEntries.length} secciones · recorrido del reporte
            </Text>
            <View style={styles.tocDivider} />

            <View style={styles.tocList}>
              {tocEntries.map((entry, idx) => (
                <View key={idx} style={styles.tocItem}>
                  <Text style={styles.tocNumber}>{entry.number}</Text>
                  <Text style={styles.tocLabel}>{entry.title}</Text>
                </View>
              ))}
            </View>
          </View>
        </Page>
      )}

      {/* ============ CONTENT ============ */}
      <Page size="A4" style={styles.contentPage}>
        <View style={styles.pageHeader} fixed>
          <View style={styles.pageHeaderLockup}>
            <Text style={styles.pageHeaderDearmas}>Dearmas</Text>
            <Text style={styles.pageHeaderCostantini}>Costantini</Text>
          </View>
          <Text style={styles.pageHeaderRight}>
            {phaseLabel} · {clientName}
          </Text>
        </View>

        <View style={styles.pageFooter} fixed>
          <Text style={styles.pageFooterText}>
            Confidencial · Dearmas Costantini · {today}
          </Text>
          <Text
            style={styles.pageFooterPageNum}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>

        <View style={styles.contentInner}>
          {(() => {
            let seenFirstH2 = false;
            return blocks.map((block, idx) => {
              if (block.type === "h2") {
                const isFirst = !seenFirstH2;
                seenFirstH2 = true;
                return renderBlock(block, idx, isFirst);
              }
              return renderBlock(block, idx);
            });
          })()}
        </View>
      </Page>
    </Document>
  );
}
