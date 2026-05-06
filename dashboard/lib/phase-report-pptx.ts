"use client";

/**
 * Generador de PowerPoint para reportes de fase.
 * 11 slides brand-aligned (en español) para presentar al cliente.
 *
 * Layout: WIDE (13.33" x 7.5", 16:9).
 *
 * Estructura:
 *   1. Tapa (cover)
 *   2. Índice
 *   3. Resumen ejecutivo
 *   4. Contexto del negocio
 *   5. Mercado y panorama competitivo
 *   6. Cliente y propuesta de valor
 *   7. Métricas y unit economics
 *   8. Hallazgos clave
 *   9. Oportunidades de crecimiento
 *  10. Roadmap a 90 días e impacto esperado
 *  11. Conclusión y próximos pasos
 *
 * Sin "Setup técnico" — esa fase es aparte y no se presenta acá.
 *
 * Pure browser, lazy-importado al click. ~700 KB el lib bundle.
 */

import { parseMarkdownBlocks, type Block } from "./markdown-blocks";

// ============ Brand colors (hex sin #) ============
const C = {
  deepGreen: "0A1A0C",
  forest: "1E3A28",
  forest2: "2C5038",
  sand: "C4A882",
  sandDark: "9B8259",
  sandLight: "D9C4A3",
  offWhite: "E8E4DC",
  ivory: "F5F2EC",
  textMuted: "7A8A7E",
  white: "FFFFFF",
};

const FONT = "Helvetica";

export interface BuildPptxOptions {
  phaseLabel: string;
  reportName: string;
  clientName: string;
  clientLogoDataUrl?: string | null;
  generatedAt: string | null;
  approvedAt: string | null;
  version: number;
  contentMd: string;
}

export async function buildPhaseReportPptx(
  opts: BuildPptxOptions,
): Promise<Blob> {
  // Lazy import — pptxgenjs es pesado, no entra al bundle inicial.
  const pptxgenMod = await import("pptxgenjs");
  // pptxgenjs default export es la clase
  const PptxGenJS =
    (pptxgenMod as unknown as { default: new () => PptxInstance }).default ??
    (pptxgenMod as unknown as new () => PptxInstance);

  const pptx = new PptxGenJS();

  pptx.title = `${opts.phaseLabel} · ${opts.clientName}`;
  pptx.subject = opts.reportName;
  pptx.author = "Dearmas Costantini";
  pptx.company = "Dearmas Costantini";
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches

  const blocks = parseMarkdownBlocks(opts.contentMd);
  const sections = groupBySection(blocks);

  // 11 slides en español, ordenados según las secciones del reporte.
  // Sin slide de "Setup" — esa fase tiene su propio reporte aparte.
  addCoverSlide(pptx, opts);                                         // 1
  addAgendaSlide(pptx, opts);                                        // 2
  addExecutiveSummarySlide(pptx, opts, sections.get(1) ?? []);       // 3
  addBusinessContextSlide(pptx, opts, sections.get(2) ?? []);        // 4
  addMarketCompetitorsSlide(pptx, opts, sections.get(3) ?? []);      // 5
  addCustomerSlide(pptx, opts, sections.get(4) ?? []);               // 6
  addMetricsSlide(pptx, opts, sections.get(6) ?? []);                // 7
  addKeyFindingsSlide(pptx, opts, sections.get(7) ?? []);            // 8
  addOpportunitiesSlide(pptx, opts, sections.get(8) ?? []);          // 9
  addRoadmapSlide(                                                   // 10
    pptx,
    opts,
    sections.get(9) ?? [],
    sections.get(10) ?? [],
    sections.get(11) ?? [],
  );
  addClosingSlide(pptx, opts, sections.get(12) ?? []);               // 11

  // pptxgenjs.write returns string|Blob|ArrayBuffer depending on outputType.
  // Forzamos blob para descargar como archivo.
  const out = await pptx.write({ outputType: "blob" });
  return out as Blob;
}

// ============================================================
// Helpers
// ============================================================

interface PptxInstance {
  title: string;
  subject: string;
  author: string;
  company: string;
  layout: string;
  addSlide: () => Slide;
  write: (opts: { outputType: "blob" }) => Promise<unknown>;
}

interface Slide {
  background: { color: string } | { fill: string };
  addText: (text: string | TextRun[], opts: TextOpts) => void;
  addShape: (shape: string, opts: ShapeOpts) => void;
  addImage: (opts: ImageOpts) => void;
}

interface TextRun {
  text: string;
  options?: TextOpts;
}

interface TextOpts {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fontFace?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  charSpacing?: number;
  lineSpacingMultiple?: number;
  bullet?: boolean | { type: "bullet" | "number"; indent?: number };
  paraSpaceBefore?: number;
  paraSpaceAfter?: number;
  fill?: { color: string };
  margin?: number;
  shape?: string;
}

interface ShapeOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: { color: string };
  line?: { color: string; width?: number };
}

interface ImageOpts {
  data?: string;
  path?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sizing?: { type: "contain" | "cover"; w: number; h: number };
}

// ============ Section grouping ============
function groupBySection(blocks: Block[]): Map<number, Block[]> {
  const result = new Map<number, Block[]>();
  let current = 0;
  for (const block of blocks) {
    if (block.type === "h2") {
      const text = blockText(block);
      const m = text.match(/^\s*(\d+)\./);
      if (m) {
        current = parseInt(m[1], 10);
        result.set(current, []);
        continue;
      }
    }
    if (current > 0) {
      const arr = result.get(current);
      if (arr) arr.push(block);
    }
  }
  return result;
}

function blockText(block: Block): string {
  if ("spans" in block) {
    return block.spans
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
  }
  return "";
}

function getBulletTexts(blocks: Block[], max: number): string[] {
  return blocks
    .filter((b) => b.type === "bullet")
    .map((b) => blockText(b))
    .slice(0, max);
}

function getParagraphs(blocks: Block[], max: number): string[] {
  return blocks
    .filter((b) => b.type === "paragraph")
    .map((b) => blockText(b))
    .filter((t) => t.length > 0)
    .slice(0, max);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ============================================================
// Slides
// ============================================================

function addCoverSlide(pptx: PptxInstance, opts: BuildPptxOptions) {
  const slide = pptx.addSlide();
  slide.background = { color: C.deepGreen };

  // Top-left: lockup DC
  slide.addText(
    [
      { text: "Dearmas", options: { bold: true, color: C.offWhite, fontSize: 28 } },
      { text: "  Costantini", options: { color: C.offWhite, fontSize: 28, charSpacing: -1 } },
    ],
    {
      x: 0.6,
      y: 0.5,
      w: 8,
      h: 0.6,
      fontFace: FONT,
    },
  );
  slide.addText("Business Growth Partners · LATAM", {
    x: 0.6,
    y: 1.1,
    w: 8,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 9,
    color: C.sand,
    charSpacing: 4,
  });

  // Top-right: client logo + name
  if (opts.clientLogoDataUrl) {
    slide.addImage({
      data: opts.clientLogoDataUrl,
      x: 11,
      y: 0.5,
      w: 1.7,
      h: 0.85,
      sizing: { type: "contain", w: 1.7, h: 0.85 },
    });
    slide.addText(opts.clientName, {
      x: 8.5,
      y: 1.4,
      w: 4.2,
      h: 0.3,
      fontFace: FONT,
      bold: true,
      fontSize: 9,
      color: C.sand,
      charSpacing: 3,
      align: "right",
    });
  } else {
    slide.addText(opts.clientName, {
      x: 8.5,
      y: 0.6,
      w: 4.2,
      h: 0.6,
      fontFace: FONT,
      bold: true,
      fontSize: 22,
      color: C.sand,
      align: "right",
      valign: "top",
    });
  }

  // Sand divider
  slide.addShape("rect", {
    x: 0.6,
    y: 3.5,
    w: 0.7,
    h: 0.04,
    fill: { color: C.sand },
  });

  // Eyebrow
  slide.addText("REPORTE DE FASE DEL ONBOARDING", {
    x: 0.6,
    y: 3.7,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 10,
    color: C.sand,
    charSpacing: 5,
  });

  // Title
  slide.addText(opts.phaseLabel, {
    x: 0.6,
    y: 4.05,
    w: 12,
    h: 1.3,
    fontFace: FONT,
    bold: true,
    fontSize: 64,
    color: C.offWhite,
    charSpacing: -2,
  });

  // Subtitle
  slide.addText(opts.reportName, {
    x: 0.6,
    y: 5.3,
    w: 12,
    h: 0.5,
    fontFace: FONT,
    fontSize: 18,
    color: C.sand,
  });

  // Bottom meta
  const metaY = 6.7;
  const metaW = 3.0;
  const metaCells = [
    { label: "CLIENTE", value: opts.clientName },
    { label: "GENERADO", value: fmtDate(opts.generatedAt) },
    {
      label: opts.approvedAt ? "APROBADO" : "ESTADO",
      value: opts.approvedAt ? fmtDate(opts.approvedAt) : "Borrador",
    },
    { label: "VERSIÓN", value: `v${opts.version}` },
  ];

  // Top divider line over meta
  slide.addShape("rect", {
    x: 0.6,
    y: metaY - 0.15,
    w: 12.1,
    h: 0.01,
    fill: { color: C.sand },
  });

  metaCells.forEach((cell, i) => {
    slide.addText(cell.label, {
      x: 0.6 + i * metaW,
      y: metaY,
      w: metaW,
      h: 0.25,
      fontFace: FONT,
      bold: true,
      fontSize: 8,
      color: C.sand,
      charSpacing: 4,
    });
    slide.addText(cell.value, {
      x: 0.6 + i * metaW,
      y: metaY + 0.27,
      w: metaW,
      h: 0.3,
      fontFace: FONT,
      fontSize: 11,
      color: C.offWhite,
    });
  });
}

function addAgendaSlide(pptx: PptxInstance, opts: BuildPptxOptions) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);

  // Title block
  slide.addText("ÍNDICE", {
    x: 0.6,
    y: 1.1,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 9,
    color: C.sandDark,
    charSpacing: 5,
  });
  slide.addText("Lo que vamos a recorrer", {
    x: 0.6,
    y: 1.4,
    w: 12,
    h: 0.8,
    fontFace: FONT,
    bold: true,
    fontSize: 36,
    color: C.deepGreen,
    charSpacing: -1,
  });

  slide.addShape("rect", {
    x: 0.6,
    y: 2.4,
    w: 0.6,
    h: 0.04,
    fill: { color: C.sand },
  });

  // 9 bloques principales (alineados con las 11 slides totales,
  // sin contar tapa e índice).
  const agenda = [
    "Resumen ejecutivo",
    "Contexto del negocio",
    "Mercado y panorama competitivo",
    "Cliente y propuesta de valor",
    "Métricas y unit economics",
    "Hallazgos clave",
    "Oportunidades de crecimiento",
    "Roadmap a 90 días e impacto esperado",
    "Conclusión y próximos pasos",
  ];

  const startY = 2.7;
  const lineH = 0.42;
  agenda.forEach((item, i) => {
    const y = startY + i * lineH;
    slide.addText(String(i + 1).padStart(2, "0"), {
      x: 0.6,
      y,
      w: 0.6,
      h: lineH,
      fontFace: FONT,
      bold: true,
      fontSize: 11,
      color: C.sandDark,
      charSpacing: 1,
    });
    slide.addText(item, {
      x: 1.2,
      y,
      w: 11,
      h: lineH,
      fontFace: FONT,
      fontSize: 14,
      color: C.deepGreen,
    });
    // separator
    slide.addShape("rect", {
      x: 0.6,
      y: y + lineH - 0.02,
      w: 11.6,
      h: 0.005,
      fill: { color: C.offWhite },
    });
  });

  addContentFooter(slide, opts, 2);
}

function addExecutiveSummarySlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(slide, "01", "Resumen ejecutivo", "Foto del estado actual y recomendación");

  // El resumen ejecutivo es prosa narrativa. Tomamos los párrafos.
  const paras = getParagraphs(blocks, 4);
  const text = paras.length > 0
    ? paras.join("\n\n")
    : "Resumen no disponible. Generá el reporte primero.";

  slide.addText(text, {
    x: 0.6,
    y: 2.5,
    w: 12.1,
    h: 4.4,
    fontFace: FONT,
    fontSize: 13,
    color: C.deepGreen,
    valign: "top",
    paraSpaceAfter: 8,
    lineSpacingMultiple: 1.4,
  });

  addContentFooter(slide, opts, 3);
}

function addBusinessContextSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(
    slide,
    "02",
    "Contexto del negocio",
    "Modelo comercial · canales actuales · madurez digital",
  );

  // Combinar bullets + párrafos para obtener máxima densidad de info
  const items = [
    ...getBulletTexts(blocks, 8),
    ...getParagraphs(blocks, 4),
  ].filter((t) => t.length > 0).slice(0, 9);

  if (items.length === 0) {
    slide.addText(
      "Contexto del negocio no disponible. Generá el Diagnóstico.",
      {
        x: 0.6,
        y: 3,
        w: 12.1,
        h: 1,
        fontFace: FONT,
        fontSize: 14,
        color: C.textMuted,
        italic: true,
      },
    );
  } else {
    slide.addText(
      items.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 12 },
          fontFace: FONT,
          fontSize: 12,
          color: C.deepGreen,
          paraSpaceAfter: 8,
        },
      })),
      { x: 0.6, y: 2.5, w: 12.1, h: 4.4, valign: "top" },
    );
  }

  addContentFooter(slide, opts, 4);
}

function addMarketCompetitorsSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(
    slide,
    "03",
    "Mercado y panorama competitivo",
    "Tamaño · momentum · top competidores y cómo comunican",
  );

  // Sacar de la sección 3 la parte de mercado (antes del primer H3 = competidor)
  const marketItems: string[] = [];
  const competitors: { name: string; lines: string[] }[] = [];
  let current: { name: string; lines: string[] } | null = null;
  let inCompetitorBlock = false;

  for (const block of blocks) {
    if (block.type === "h3") {
      inCompetitorBlock = true;
      if (current) competitors.push(current);
      current = { name: blockText(block), lines: [] };
    } else if (inCompetitorBlock && current) {
      const txt = blockText(block);
      if (txt && (block.type === "bullet" || block.type === "paragraph")) {
        if (current.lines.length < 3) current.lines.push(txt);
      }
    } else if (!inCompetitorBlock) {
      // Estamos en la parte de mercado (antes de los competidores)
      const txt = blockText(block);
      if (txt && (block.type === "bullet" || block.type === "paragraph")) {
        marketItems.push(txt);
      }
    }
  }
  if (current) competitors.push(current);

  // Layout: izquierda mercado (1/3), derecha 3 cards de competidores (2/3)
  // Sub-eyebrows
  slide.addText("MERCADO", {
    x: 0.6,
    y: 2.5,
    w: 3.6,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 10,
    color: C.sandDark,
    charSpacing: 4,
  });
  if (marketItems.length > 0) {
    slide.addText(
      marketItems.slice(0, 4).map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 10 },
          fontFace: FONT,
          fontSize: 11,
          color: C.deepGreen,
          paraSpaceAfter: 6,
        },
      })),
      { x: 0.6, y: 2.9, w: 3.6, h: 4.0, valign: "top" },
    );
  } else {
    slide.addText("⚠ Falta análisis de mercado en el reporte.", {
      x: 0.6,
      y: 2.9,
      w: 3.6,
      h: 0.4,
      fontFace: FONT,
      fontSize: 11,
      color: C.textMuted,
      italic: true,
    });
  }

  // Cards de competidores en columna derecha (3 verticales)
  slide.addText("TOP 3 COMPETIDORES", {
    x: 4.5,
    y: 2.5,
    w: 8.2,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 10,
    color: C.sandDark,
    charSpacing: 4,
  });

  const top = competitors.slice(0, 3);
  if (top.length > 0) {
    const cardX = 4.5;
    const cardW = 8.2;
    const cardStartY = 2.9;
    const cardH = 1.35;
    const cardGap = 0.1;
    top.forEach((comp, i) => {
      const y = cardStartY + i * (cardH + cardGap);
      // Card bg
      slide.addShape("rect", {
        x: cardX,
        y,
        w: cardW,
        h: cardH,
        fill: { color: C.ivory },
        line: { color: C.sand, width: 0.5 },
      });
      // Stripe izquierda sand
      slide.addShape("rect", {
        x: cardX,
        y,
        w: 0.06,
        h: cardH,
        fill: { color: C.sand },
      });
      // Nombre
      slide.addText(comp.name, {
        x: cardX + 0.2,
        y: y + 0.1,
        w: cardW - 0.4,
        h: 0.4,
        fontFace: FONT,
        bold: true,
        fontSize: 14,
        color: C.deepGreen,
      });
      // Hallazgos
      const lines = comp.lines.length > 0 ? comp.lines.slice(0, 3) : ["—"];
      slide.addText(
        lines.map((t) => ({
          text: t,
          options: {
            bullet: { type: "bullet", indent: 8 },
            fontFace: FONT,
            fontSize: 9.5,
            color: C.deepGreen,
            paraSpaceAfter: 2,
          },
        })),
        {
          x: cardX + 0.2,
          y: y + 0.5,
          w: cardW - 0.4,
          h: cardH - 0.55,
          valign: "top",
        },
      );
    });
  } else {
    slide.addText(
      "Generá el Diagnóstico para ver competidores y cómo comunican.",
      {
        x: 4.5,
        y: 2.9,
        w: 8.2,
        h: 0.4,
        fontFace: FONT,
        fontSize: 11,
        color: C.textMuted,
        italic: true,
      },
    );
  }

  addContentFooter(slide, opts, 5);
}

function addMetricsSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(
    slide,
    "05",
    "Métricas y unit economics",
    "Tráfico · conversión · CAC · ROAS break-even · capacidad de escala",
  );

  const items = [
    ...getBulletTexts(blocks, 9),
    ...getParagraphs(blocks, 3),
  ].filter((t) => t.length > 0).slice(0, 10);

  if (items.length === 0) {
    slide.addText(
      "Métricas y unit economics no disponibles. Generá el Diagnóstico.",
      {
        x: 0.6,
        y: 3,
        w: 12.1,
        h: 1,
        fontFace: FONT,
        fontSize: 14,
        color: C.textMuted,
        italic: true,
      },
    );
  } else {
    slide.addText(
      items.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 12 },
          fontFace: FONT,
          fontSize: 12,
          color: C.deepGreen,
          paraSpaceAfter: 7,
        },
      })),
      { x: 0.6, y: 2.5, w: 12.1, h: 4.4, valign: "top" },
    );
  }

  addContentFooter(slide, opts, 7); // Métricas y unit economics → slide 7
}

function addCustomerSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(
    slide,
    "04",
    "Cliente y propuesta de valor",
    "Buyer personas · motivadores · objeciones · claridad del mensaje",
  );

  const items = [
    ...getBulletTexts(blocks, 8),
    ...getParagraphs(blocks, 3),
  ].slice(0, 8);

  if (items.length === 0) {
    slide.addText(
      "Información del cliente no disponible. Generá el Diagnóstico.",
      {
        x: 0.6,
        y: 3,
        w: 12.1,
        h: 1,
        fontFace: FONT,
        fontSize: 14,
        color: C.textMuted,
        italic: true,
      },
    );
  } else {
    slide.addText(
      items.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 12 },
          fontFace: FONT,
          fontSize: 13,
          color: C.deepGreen,
          paraSpaceAfter: 8,
        },
      })),
      { x: 0.6, y: 2.5, w: 12.1, h: 4.4, valign: "top" },
    );
  }

  addContentFooter(slide, opts, 6);
}

function addKeyFindingsSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(
    slide,
    "06",
    "Hallazgos clave",
    "Lo crítico que surge del diagnóstico — categorizado por área",
  );

  const items = getBulletTexts(blocks, 8);
  if (items.length === 0) {
    slide.addText("Hallazgos no disponibles. Generá el Diagnóstico.", {
      x: 0.6,
      y: 3,
      w: 12.1,
      h: 1,
      fontFace: FONT,
      fontSize: 14,
      color: C.textMuted,
      italic: true,
    });
  } else {
    slide.addText(
      items.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 12 },
          fontFace: FONT,
          fontSize: 13,
          color: C.deepGreen,
          paraSpaceAfter: 10,
        },
      })),
      { x: 0.6, y: 2.5, w: 12.1, h: 4.4, valign: "top" },
    );
  }

  addContentFooter(slide, opts, 8); // Hallazgos clave → slide 8
}

function addOpportunitiesSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(
    slide,
    "07",
    "Oportunidades de crecimiento",
    "Priorizadas por impacto, urgencia y facilidad de ejecución",
  );

  // Extraemos las top 6 oportunidades. Si hay tabla, usamos las filas (sin header).
  const tableBlock = blocks.find((b) => b.type === "table");
  const opportunities: string[] = [];
  if (tableBlock && tableBlock.type === "table") {
    const rows = tableBlock.hasHeader
      ? tableBlock.rows.slice(1)
      : tableBlock.rows;
    for (const row of rows.slice(0, 6)) {
      // Concatenamos las celdas: # | Oportunidad | Impacto | Urgencia | Facilidad | Score
      const cells = row.map((c) =>
        c.map((s) => ("text" in s ? s.text : "")).join("").trim(),
      );
      // Mostramos: "[#] Oportunidad — Impacto/Urgencia/Facilidad"
      const num = cells[0] || "";
      const opp = cells[1] || "";
      const meta = cells.slice(2).filter(Boolean).join(" · ");
      const text = num ? `${num}. ${opp}` : opp;
      opportunities.push(meta ? `${text} — ${meta}` : text);
    }
  } else {
    // Fallback: bullets
    opportunities.push(...getBulletTexts(blocks, 6));
  }

  if (opportunities.length === 0) {
    slide.addText("Oportunidades no disponibles.", {
      x: 0.6,
      y: 3,
      w: 12.1,
      h: 1,
      fontFace: FONT,
      fontSize: 14,
      color: C.textMuted,
      italic: true,
    });
  } else {
    slide.addText(
      opportunities.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 12 },
          fontFace: FONT,
          fontSize: 13,
          color: C.deepGreen,
          paraSpaceAfter: 10,
        },
      })),
      { x: 0.6, y: 2.5, w: 12.1, h: 4.4, valign: "top" },
    );
  }

  addContentFooter(slide, opts, 9); // Oportunidades → slide 9
}

function addRoadmapSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  recommendationsBlocks: Block[],
  roadmapBlocks: Block[],
  impactBlocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(
    slide,
    "08",
    "Roadmap a 90 días",
    "Recomendaciones · plan de ejecución · impacto esperado",
  );

  // 3 columnas: Recomendaciones (1/3) · Roadmap (1/3) · Impacto (1/3)
  const colW = (12.1 - 2 * 0.25) / 3;
  const colY = 2.5;
  const labelH = 0.3;
  const bodyY = colY + 0.4;
  const bodyH = 4.4;

  function flatBullets(blocks: Block[], max: number): string[] {
    const bullets = getBulletTexts(blocks, max);
    if (bullets.length > 0) return bullets;
    // Fallback: parsear tablas como bullets
    const items: string[] = [];
    const tables = blocks.filter((b) => b.type === "table");
    for (const tb of tables) {
      if (tb.type !== "table") continue;
      const rows = tb.hasHeader ? tb.rows.slice(1) : tb.rows;
      for (const row of rows.slice(0, max)) {
        const cells = row
          .map((c) => c.map((s) => ("text" in s ? s.text : "")).join("").trim())
          .filter(Boolean);
        items.push(cells.join(" · "));
      }
    }
    return items.slice(0, max);
  }

  const recs = [
    ...flatBullets(recommendationsBlocks, 7),
    ...getParagraphs(recommendationsBlocks, 2),
  ].slice(0, 7);
  const roadmap = flatBullets(roadmapBlocks, 7);
  const impact = [
    ...flatBullets(impactBlocks, 7),
    ...getParagraphs(impactBlocks, 2),
  ].slice(0, 7);

  const cols = [
    { x: 0.6, label: "RECOMENDACIONES", items: recs },
    { x: 0.6 + colW + 0.25, label: "EJECUCIÓN A 90 DÍAS", items: roadmap },
    { x: 0.6 + 2 * (colW + 0.25), label: "IMPACTO ESPERADO", items: impact },
  ];

  cols.forEach((col) => {
    slide.addText(col.label, {
      x: col.x,
      y: colY,
      w: colW,
      h: labelH,
      fontFace: FONT,
      bold: true,
      fontSize: 10,
      color: C.sandDark,
      charSpacing: 3,
    });
    if (col.items.length > 0) {
      slide.addText(
        col.items.map((t) => ({
          text: t,
          options: {
            bullet: { type: "bullet", indent: 8 },
            fontFace: FONT,
            fontSize: 10,
            color: C.deepGreen,
            paraSpaceAfter: 5,
          },
        })),
        { x: col.x, y: bodyY, w: colW, h: bodyH, valign: "top" },
      );
    } else {
      slide.addText("⚠ Falta info en el reporte.", {
        x: col.x,
        y: bodyY,
        w: colW,
        h: 0.4,
        fontFace: FONT,
        fontSize: 10,
        color: C.textMuted,
        italic: true,
      });
    }
  });

  addContentFooter(slide, opts, 10); // Roadmap + impacto → slide 10
}

function addClosingSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.deepGreen };

  // Sand divider
  slide.addShape("rect", {
    x: 0.6,
    y: 1.0,
    w: 0.7,
    h: 0.04,
    fill: { color: C.sand },
  });

  slide.addText("CONCLUSIÓN", {
    x: 0.6,
    y: 1.2,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 10,
    color: C.sand,
    charSpacing: 5,
  });

  slide.addText("Próximos pasos", {
    x: 0.6,
    y: 1.55,
    w: 12,
    h: 1,
    fontFace: FONT,
    bold: true,
    fontSize: 44,
    color: C.offWhite,
    charSpacing: -1,
  });

  // Body — paragrafos de la conclusion + bullets de next steps
  const items = [
    ...getParagraphs(blocks, 2),
    ...getBulletTexts(blocks, 5),
  ].slice(0, 5);

  if (items.length > 0) {
    slide.addText(
      items.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 12 },
          fontFace: FONT,
          fontSize: 14,
          color: C.offWhite,
          paraSpaceAfter: 10,
        },
      })),
      { x: 0.6, y: 3.3, w: 12.1, h: 3.5, valign: "top" },
    );
  }

  // Bottom: lockup DC discreto
  slide.addText(
    [
      { text: "Dearmas", options: { bold: true, color: C.offWhite, fontSize: 11 } },
      { text: " Costantini", options: { color: C.offWhite, fontSize: 11 } },
    ],
    {
      x: 0.6,
      y: 7.1,
      w: 6,
      h: 0.3,
      fontFace: FONT,
    },
  );
  slide.addText(`${opts.phaseLabel} · ${opts.clientName}`, {
    x: 7,
    y: 7.1,
    w: 5.6,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: C.sand,
    align: "right",
    charSpacing: 2,
  });
}

// ============================================================
// Header / Footer comunes (slides de contenido)
// ============================================================

function addContentHeader(slide: Slide, opts: BuildPptxOptions) {
  // Lockup DC chico arriba a la izquierda
  slide.addText(
    [
      { text: "Dearmas", options: { bold: true, color: C.deepGreen, fontSize: 10 } },
      { text: " Costantini", options: { color: C.deepGreen, fontSize: 10 } },
    ],
    {
      x: 0.6,
      y: 0.3,
      w: 6,
      h: 0.3,
      fontFace: FONT,
    },
  );
  // Tag arriba a la derecha
  slide.addText(`${opts.phaseLabel} · ${opts.clientName}`, {
    x: 7,
    y: 0.3,
    w: 5.6,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 8,
    color: C.sandDark,
    align: "right",
    charSpacing: 2,
  });
  // Línea sand
  slide.addShape("rect", {
    x: 0.6,
    y: 0.7,
    w: 12.1,
    h: 0.01,
    fill: { color: C.sand },
  });
}

function addContentFooter(
  slide: Slide,
  opts: BuildPptxOptions,
  pageNum: number,
) {
  slide.addShape("rect", {
    x: 0.6,
    y: 7.05,
    w: 12.1,
    h: 0.005,
    fill: { color: C.deepGreen },
  });
  slide.addText("Confidencial · Dearmas Costantini", {
    x: 0.6,
    y: 7.15,
    w: 6,
    h: 0.25,
    fontFace: FONT,
    fontSize: 8,
    color: C.textMuted,
  });
  slide.addText(`${pageNum} / 11`, {
    x: 7,
    y: 7.15,
    w: 5.6,
    h: 0.25,
    fontFace: FONT,
    fontSize: 8,
    color: C.textMuted,
    align: "right",
  });
  // Suppress unused param lint
  void opts;
}

function addContentTitle(
  slide: Slide,
  num: string,
  title: string,
  subtitle: string,
) {
  // Eyebrow con número
  slide.addText(`SECCIÓN ${num}`, {
    x: 0.6,
    y: 1.0,
    w: 12,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 9,
    color: C.sandDark,
    charSpacing: 4,
  });
  // Title
  slide.addText(title, {
    x: 0.6,
    y: 1.3,
    w: 12,
    h: 0.6,
    fontFace: FONT,
    bold: true,
    fontSize: 32,
    color: C.deepGreen,
    charSpacing: -1,
  });
  // Subtitle
  slide.addText(subtitle, {
    x: 0.6,
    y: 1.95,
    w: 12,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    color: C.textMuted,
  });
  // Sand divider
  slide.addShape("rect", {
    x: 0.6,
    y: 2.4,
    w: 0.6,
    h: 0.04,
    fill: { color: C.sand },
  });
}
