"use client";

/**
 * Generador de DOCX para reportes de fase.
 *
 * Filosofía: el .docx contiene SOLO el cuerpo editable del reporte.
 * Cover, TOC, headers/footers de página y metadata se rearman
 * automáticamente cuando re-exportás a PDF/PPT desde nuestro sistema —
 * no entran al docx. Esto evita que esos elementos visuales viajen
 * como "contenido" al subir el docx editado, que era lo que rompía
 * el diseño.
 *
 * Mapeo markdown ↔ docx (round-trip estable con mammoth+turndown):
 *   ## N. Sección  ↔  Heading 1 con texto "N. Sección"
 *   ### Subsección  ↔  Heading 2
 *   #### Sub-sub   ↔  Heading 3
 *   párrafo        ↔  Normal
 *   - bullet        ↔  Lista con bullets
 *   1. item         ↔  Lista numerada
 *   | t1 | t2 |    ↔  Tabla
 *   **bold**        ↔  run bold
 *   *italic*        ↔  run italic
 *
 * El docx exportado usa Calibri 11pt body y la paleta de marca DC
 * (deep green + sand). Es editable cómodo en Word/Google Docs.
 */

import {
  parseMarkdownBlocks,
  type Block,
  type InlineSpan,
} from "./markdown-blocks";

export interface PhaseReportDocxInput {
  phaseLabel: string;   // "Diagnóstico"
  reportName: string;   // "Growth Diagnosis Plan"
  clientName: string;
  version: number;
  generatedAt: string | null;
  contentMd: string;
}

// Brand colors (versión hex sin #, que es lo que docx-js espera)
const C = {
  deepGreen: "0A1A0C",
  sandDark: "9B8259",
  sand: "C4A882",
  textMuted: "5A6A5E",
  linkBlue: "1F5A8E",
};

/**
 * Genera un Blob .docx desde un reporte. Lazy-load la lib `docx` para
 * no inflar el bundle de la página.
 */
export async function buildPhaseReportDocx(
  input: PhaseReportDocxInput,
): Promise<Blob> {
  const docx = await import("docx");
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageOrientation,
    LevelFormat,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    ShadingType,
    ExternalHyperlink,
    PageBreak,
  } = docx;

  const blocks = parseMarkdownBlocks(input.contentMd);

  // ============================================================
  // Inline span renderer
  // ============================================================
  function renderSpans(spans: InlineSpan[]): InstanceType<typeof TextRun>[] {
    return spans
      .map((s) => {
        if (s.type === "text") return new TextRun({ text: s.text });
        if (s.type === "bold")
          return new TextRun({ text: s.text, bold: true });
        if (s.type === "italic")
          return new TextRun({ text: s.text, italics: true });
        if (s.type === "code")
          return new TextRun({
            text: s.text,
            font: "Courier New",
            size: 20, // 10pt
          });
        if (s.type === "link") {
          // Para links retornamos un TextRun visible con estilo;
          // los wrappers ExternalHyperlink se manejan fuera porque
          // van como children del paragraph, no del run.
          return new TextRun({
            text: s.text,
            color: C.linkBlue,
            underline: { type: "single" },
          });
        }
        return new TextRun({ text: "" });
      })
      .filter(Boolean);
  }

  // Para soportar hyperlinks reales necesitamos detectar spans link
  // y emitirlos como ExternalHyperlink dentro del paragraph.
  function renderParaChildren(
    spans: InlineSpan[],
  ): Array<InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>> {
    const out: Array<
      InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>
    > = [];
    for (const s of spans) {
      if (s.type === "link") {
        out.push(
          new ExternalHyperlink({
            link: s.href,
            children: [
              new TextRun({
                text: s.text,
                color: C.linkBlue,
                underline: { type: "single" },
              }),
            ],
          }),
        );
      } else {
        out.push(...renderSpans([s]));
      }
    }
    return out;
  }

  // ============================================================
  // Block → docx element
  // ============================================================
  const children: Array<
    InstanceType<typeof Paragraph> | InstanceType<typeof Table>
  > = [];

  // Header del documento: marca + título de fase. Esto NO es un cover
  // page (no queremos que viaje al re-importar), es solo un encabezado
  // visual liviano para que cuando edites en Word veas qué reporte es.
  // Lo armamos como párrafos normales que la normalización del upload
  // strippeará automáticamente.
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "DEARMAS COSTANTINI · BUSINESS GROWTH PARTNERS",
          bold: true,
          size: 14, // 7pt
          color: C.sandDark,
        }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${input.phaseLabel.toUpperCase()} · ${input.clientName.toUpperCase()} · v${input.version}`,
          bold: true,
          size: 16, // 8pt
          color: C.deepGreen,
        }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: input.reportName,
          size: 22, // 11pt
          color: C.textMuted,
        }),
      ],
      spacing: { after: 240 },
      border: {
        bottom: {
          color: C.sand,
          space: 8,
          style: BorderStyle.SINGLE,
          size: 8,
        },
      },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            "Editá libremente este documento. El cover, el índice y la paginación se rearman automáticamente al re-importarlo y exportarlo a PDF. No incluyas elementos visuales pesados (imágenes grandes, logos repetidos) — el sistema agrega los suyos.",
          italics: true,
          size: 18, // 9pt
          color: C.textMuted,
        }),
      ],
      spacing: { after: 320 },
    }),
  );

  // Track de numbering reference para listas (necesario en docx-js)
  for (const block of blocks) {
    switch (block.type) {
      case "h1":
        children.push(
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: renderParaChildren(block.spans),
            spacing: { before: 240, after: 120 },
          }),
        );
        break;
      case "h2":
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: renderParaChildren(block.spans),
            spacing: { before: 320, after: 120 },
            pageBreakBefore: false, // dejar que Word fluya
          }),
        );
        break;
      case "h3":
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: renderParaChildren(block.spans),
            spacing: { before: 200, after: 80 },
          }),
        );
        break;
      case "h4":
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: renderParaChildren(block.spans),
            spacing: { before: 160, after: 60 },
          }),
        );
        break;
      case "paragraph":
        children.push(
          new Paragraph({
            children: renderParaChildren(block.spans),
            spacing: { after: 120 },
          }),
        );
        break;
      case "bullet":
        children.push(
          new Paragraph({
            children: renderParaChildren(block.spans),
            numbering: { reference: "bullets", level: Math.min(block.level, 2) },
            spacing: { after: 60 },
          }),
        );
        break;
      case "ordered":
        children.push(
          new Paragraph({
            children: renderParaChildren(block.spans),
            numbering: { reference: "numbers", level: Math.min(block.level, 2) },
            spacing: { after: 60 },
          }),
        );
        break;
      case "table": {
        const tableRows = block.rows.map(
          (row, rIdx) =>
            new TableRow({
              tableHeader: rIdx === 0 && block.hasHeader,
              children: row.map(
                (cellSpans) =>
                  new TableCell({
                    width: {
                      size: 9360 / Math.max(row.length, 1),
                      type: WidthType.DXA,
                    },
                    shading:
                      rIdx === 0 && block.hasHeader
                        ? { fill: C.deepGreen, type: ShadingType.CLEAR, color: "auto" }
                        : undefined,
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
                      bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
                      left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
                      right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
                    },
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    children: [
                      new Paragraph({
                        children:
                          rIdx === 0 && block.hasHeader
                            ? cellSpans.map(
                                (s) =>
                                  new TextRun({
                                    text: "text" in s ? s.text : "",
                                    bold: true,
                                    color: "FFFFFF",
                                    size: 18,
                                  }),
                              )
                            : renderParaChildren(cellSpans),
                      }),
                    ],
                  }),
              ),
            }),
        );
        children.push(
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            columnWidths: Array.from(
              { length: block.rows[0]?.length ?? 1 },
              () => Math.floor(9360 / Math.max(block.rows[0]?.length ?? 1, 1)),
            ),
            rows: tableRows,
          }),
        );
        break;
      }
      case "hr":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "" })],
            border: {
              bottom: {
                color: "CCCCCC",
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
              },
            },
            spacing: { before: 120, after: 120 },
          }),
        );
        break;
      case "blockquote":
        children.push(
          new Paragraph({
            children: renderParaChildren(block.spans).map((c) => c),
            indent: { left: 360 },
            spacing: { after: 120 },
            border: {
              left: {
                color: C.sand,
                space: 8,
                style: BorderStyle.SINGLE,
                size: 12,
              },
            },
          }),
        );
        break;
      case "spacer":
        // Sin spacer: el spacing entre párrafos ya lo maneja docx.
        break;
    }
  }

  // ============================================================
  // Document setup
  // ============================================================
  const doc = new Document({
    creator: "Dearmas Costantini Scale",
    title: `${input.phaseLabel} · ${input.clientName}`,
    description: input.reportName,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } }, // 11pt body
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 56, bold: true, font: "Calibri", color: C.deepGreen },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 40, bold: true, font: "Calibri", color: C.deepGreen },
          paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 26, bold: true, font: "Calibri", color: C.sandDark },
          paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 1 },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 22, bold: true, font: "Calibri", color: C.deepGreen },
          paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: "◦",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 1440, hanging: 360 } },
              },
            },
            {
              level: 2,
              format: LevelFormat.BULLET,
              text: "▪",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 2160, hanging: 360 } },
              },
            },
          ],
        },
        {
          reference: "numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
              },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: "%2.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 1440, hanging: 360 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240, // US Letter
              height: 15840,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}
