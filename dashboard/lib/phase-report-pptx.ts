"use client";

/**
 * Generador de PowerPoint para reportes de fase.
 * 10 slides brand-aligned para presentar al cliente.
 *
 * Layout: WIDE (13.33" x 7.5", 16:9).
 *
 * Estructura:
 *   1. Cover
 *   2. Agenda
 *   3. Executive Summary
 *   4. Mercado (sección 2 + 3 condensadas)
 *   5. Análisis competitivo
 *   6. Cliente y propuesta de valor
 *   7. Hallazgos clave
 *   8. Oportunidades de crecimiento
 *   9. Roadmap 90 días + impacto esperado
 *  10. Conclusión y próximos pasos
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

  addCoverSlide(pptx, opts);
  addAgendaSlide(pptx, opts, sections);
  addExecutiveSummarySlide(pptx, opts, sections.get(1) ?? []);
  addMarketSlide(pptx, opts, sections.get(2) ?? [], sections.get(3) ?? []);
  addCompetitorSlide(pptx, opts, sections.get(3) ?? []);
  addCustomerSlide(pptx, opts, sections.get(4) ?? []);
  addKeyFindingsSlide(pptx, opts, sections.get(7) ?? []);
  addOpportunitiesSlide(pptx, opts, sections.get(8) ?? []);
  addRoadmapSlide(
    pptx,
    opts,
    sections.get(10) ?? [],
    sections.get(11) ?? [],
  );
  addClosingSlide(pptx, opts, sections.get(12) ?? []);

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

function addAgendaSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  sections: Map<number, Block[]>,
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);

  // Title block
  slide.addText("AGENDA", {
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

  // Lista — los 8 bloques principales que tiene la presentación
  const agenda = [
    "Resumen ejecutivo",
    "Análisis del mercado",
    "Análisis competitivo",
    "Cliente y propuesta de valor",
    "Hallazgos clave",
    "Oportunidades de crecimiento",
    "Roadmap a 90 días e impacto esperado",
    "Conclusión y próximos pasos",
  ];

  const startY = 2.8;
  const lineH = 0.45;
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
  addContentTitle(slide, "01", "Executive Summary", "Foto del estado actual");

  // El executive summary es prosa narrativa. Tomamos los párrafos.
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

function addMarketSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  ctxBlocks: Block[],
  marketBlocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(slide, "02", "Market & Context", "Negocio y mercado");

  const ctxBullets = getBulletTexts(ctxBlocks, 5);
  // Del market sacamos los primeros bullets/párrafos antes de la sub-sección competidores
  const marketTopParas = marketBlocks
    .filter((b) => b.type === "bullet" || b.type === "paragraph")
    .slice(0, 5)
    .map((b) => blockText(b));

  const leftItems = ctxBullets.length > 0 ? ctxBullets : marketTopParas;
  const rightItems = ctxBullets.length > 0 ? marketTopParas : [];

  // Left column: Negocio
  slide.addText("CONTEXTO DEL NEGOCIO", {
    x: 0.6,
    y: 2.5,
    w: 5.7,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 10,
    color: C.sandDark,
    charSpacing: 4,
  });
  if (leftItems.length > 0) {
    slide.addText(
      leftItems.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 12 },
          fontFace: FONT,
          fontSize: 12,
          color: C.deepGreen,
          paraSpaceAfter: 6,
        },
      })),
      { x: 0.6, y: 2.9, w: 5.7, h: 4.0, valign: "top" },
    );
  }

  // Right column: Mercado
  slide.addText("MERCADO Y MOMENTUM", {
    x: 6.9,
    y: 2.5,
    w: 5.7,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 10,
    color: C.sandDark,
    charSpacing: 4,
  });
  if (rightItems.length > 0) {
    slide.addText(
      rightItems.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 12 },
          fontFace: FONT,
          fontSize: 12,
          color: C.deepGreen,
          paraSpaceAfter: 6,
        },
      })),
      { x: 6.9, y: 2.9, w: 5.7, h: 4.0, valign: "top" },
    );
  }

  addContentFooter(slide, opts, 4);
}

function addCompetitorSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(slide, "03", "Análisis competitivo", "Top competidores y cómo comunican");

  // Buscamos los H3 (que son los competidores) y juntamos un highlight de cada uno
  const competitors: { name: string; lines: string[] }[] = [];
  let current: { name: string; lines: string[] } | null = null;
  for (const block of blocks) {
    if (block.type === "h3") {
      if (current) competitors.push(current);
      current = { name: blockText(block), lines: [] };
    } else if (current) {
      const txt = blockText(block);
      if (txt && (block.type === "bullet" || block.type === "paragraph")) {
        if (current.lines.length < 3) current.lines.push(txt);
      }
    }
  }
  if (current) competitors.push(current);

  const top = competitors.slice(0, 3);

  if (top.length === 0) {
    slide.addText(
      "Análisis competitivo no disponible. Generá el Diagnóstico para ver los top competidores y cómo comunican.",
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
    const startY = 2.5;
    const cardW = (12.1 - 2 * 0.3) / 3;
    const cardH = 4.4;
    top.forEach((comp, i) => {
      const x = 0.6 + i * (cardW + 0.3);
      // Card background
      slide.addShape("rect", {
        x,
        y: startY,
        w: cardW,
        h: cardH,
        fill: { color: C.ivory },
        line: { color: C.sand, width: 1 },
      });
      // Sand stripe top
      slide.addShape("rect", {
        x,
        y: startY,
        w: cardW,
        h: 0.1,
        fill: { color: C.sand },
      });
      // Name
      slide.addText(comp.name, {
        x: x + 0.2,
        y: startY + 0.25,
        w: cardW - 0.4,
        h: 0.6,
        fontFace: FONT,
        bold: true,
        fontSize: 18,
        color: C.deepGreen,
        charSpacing: -0.5,
      });
      // Lines
      const lines = comp.lines.length > 0 ? comp.lines : ["—"];
      slide.addText(
        lines.map((t) => ({
          text: t,
          options: {
            bullet: { type: "bullet", indent: 10 },
            fontFace: FONT,
            fontSize: 11,
            color: C.deepGreen,
            paraSpaceAfter: 6,
          },
        })),
        {
          x: x + 0.2,
          y: startY + 1,
          w: cardW - 0.4,
          h: cardH - 1.2,
          valign: "top",
        },
      );
    });
  }

  addContentFooter(slide, opts, 5);
}

function addCustomerSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(slide, "04", "Cliente y propuesta de valor", "Buyer personas y diagnóstico de mensaje");

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
  addContentTitle(slide, "05", "Key Findings", "Hallazgos críticos del diagnóstico");

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

  addContentFooter(slide, opts, 7);
}

function addOpportunitiesSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  blocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(slide, "06", "Growth Opportunities", "Oportunidades priorizadas");

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

  addContentFooter(slide, opts, 8);
}

function addRoadmapSlide(
  pptx: PptxInstance,
  opts: BuildPptxOptions,
  roadmapBlocks: Block[],
  impactBlocks: Block[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  addContentHeader(slide, opts);
  addContentTitle(slide, "07", "90-Day Roadmap", "Plan de acción + impacto esperado");

  // Roadmap del lado izquierdo (top 6 acciones)
  const roadmapBullets = getBulletTexts(roadmapBlocks, 6);
  // Si vienen tablas, sacamos las primeras 5 filas
  const tables = roadmapBlocks.filter((b) => b.type === "table");
  const roadmapItems: string[] = [];
  if (roadmapBullets.length === 0 && tables.length > 0) {
    for (const tb of tables) {
      if (tb.type !== "table") continue;
      const rows = tb.hasHeader ? tb.rows.slice(1) : tb.rows;
      for (const row of rows.slice(0, 3)) {
        const cells = row
          .map((c) => c.map((s) => ("text" in s ? s.text : "")).join("").trim())
          .filter(Boolean);
        roadmapItems.push(cells.join(" · "));
      }
    }
  } else {
    roadmapItems.push(...roadmapBullets);
  }

  slide.addText("ROADMAP DE EJECUCIÓN", {
    x: 0.6,
    y: 2.5,
    w: 5.7,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 10,
    color: C.sandDark,
    charSpacing: 4,
  });
  if (roadmapItems.length > 0) {
    slide.addText(
      roadmapItems.slice(0, 8).map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 10 },
          fontFace: FONT,
          fontSize: 11,
          color: C.deepGreen,
          paraSpaceAfter: 6,
        },
      })),
      { x: 0.6, y: 2.9, w: 5.7, h: 4.0, valign: "top" },
    );
  }

  // Impacto esperado del lado derecho
  slide.addText("IMPACTO ESPERADO", {
    x: 6.9,
    y: 2.5,
    w: 5.7,
    h: 0.3,
    fontFace: FONT,
    bold: true,
    fontSize: 10,
    color: C.sandDark,
    charSpacing: 4,
  });
  const impactBullets = [
    ...getBulletTexts(impactBlocks, 6),
    ...getParagraphs(impactBlocks, 3),
  ].slice(0, 6);
  if (impactBullets.length > 0) {
    slide.addText(
      impactBullets.map((t) => ({
        text: t,
        options: {
          bullet: { type: "bullet", indent: 10 },
          fontFace: FONT,
          fontSize: 11,
          color: C.deepGreen,
          paraSpaceAfter: 6,
        },
      })),
      { x: 6.9, y: 2.9, w: 5.7, h: 4.0, valign: "top" },
    );
  }

  addContentFooter(slide, opts, 9);
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
  slide.addText(`${pageNum} / 10`, {
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
