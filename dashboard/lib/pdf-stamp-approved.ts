"use client";

/**
 * Reemplaza la palabra "Borrador" por "Aprobado" en un PDF.
 *
 * Cuando el director aprueba una fase, esta lib transforma el PDF
 * subido (que tiene "Borrador" en la carátula porque fue editado en
 * estado draft) para que diga "Aprobado". El resto del diseño queda
 * idéntico — no se re-renderiza nada más.
 *
 * Estrategia:
 * 1. pdfjs escanea las primeras páginas y encuentra todas las
 *    apariciones de "Borrador" con sus coordenadas (x, y, width, h).
 * 2. pdf-lib dibuja:
 *    - un rectángulo blanco sobre cada aparición (para tapar el
 *      texto original)
 *    - el texto "Aprobado" encima con tipografía similar
 *
 * Limitaciones conocidas:
 * - Si la palabra está sobre un fondo dark (cover negro/verde), el
 *   rectángulo blanco se va a ver. Para esos casos el director
 *   tendría que ajustar manualmente — pero la mayoría de PDFs de
 *   reportes usan fondo claro en la metadata del cover.
 * - Si la palabra "Borrador" no aparece como texto seleccionable
 *   (por ej. el PDF la tiene como imagen), no se puede modificar.
 *
 * Uso:
 *   const newBlob = await stampApproved(originalBlob);
 */

interface PdfJsTextItem {
  str: string;
  transform: [number, number, number, number, number, number];
  width: number;
  height: number;
}

interface PdfJsLib {
  getDocument: (src: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: PdfJsTextItem[] }>;
      }>;
    }>;
  };
  GlobalWorkerOptions: { workerSrc: string };
  version: string;
}

let cachedLib: PdfJsLib | null = null;
async function loadPdfJs(): Promise<PdfJsLib> {
  if (cachedLib) return cachedLib;
  const lib = (await import("pdfjs-dist")) as unknown as PdfJsLib;
  if (typeof window !== "undefined" && lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;
  }
  cachedLib = lib;
  return lib;
}

interface Match {
  pageIdx: number;     // 0-based para pdf-lib
  x: number;
  y: number;           // from page bottom (pdfjs y es desde el bottom igual)
  width: number;
  height: number;
}

export async function stampApproved(pdfBlob: Blob): Promise<Blob> {
  const arrayBuffer = await pdfBlob.arrayBuffer();

  // ====== 1. Scan con pdfjs ======
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const matches: Match[] = [];
  const TARGET = "borrador";

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const text = item.str ?? "";
      if (!text) continue;
      if (text.toLowerCase().includes(TARGET)) {
        // pdfjs transform: [scaleX, skewY, skewX, scaleY, x, y]
        // item.width / item.height están en unidades del PDF
        matches.push({
          pageIdx: n - 1,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height || 12,
        });
      }
    }
  }

  if (matches.length === 0) {
    // No hay "Borrador" — devolvemos el blob original sin tocar.
    return pdfBlob;
  }

  // ====== 2. Modificar con pdf-lib ======
  const pdfLib = await import("pdf-lib");
  const { PDFDocument, rgb, StandardFonts } = pdfLib;

  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const m of matches) {
    const page = pdfDoc.getPage(m.pageIdx);

    // Padding alrededor del rect para tapar bien el texto
    const padX = 1;
    const padY = 2;

    // Rectángulo blanco (más alto que el char height para cubrir ascenders/descenders)
    page.drawRectangle({
      x: m.x - padX,
      y: m.y - padY,
      width: m.width + padX * 2,
      height: m.height + padY * 2,
      color: rgb(1, 1, 1),
    });

    // Texto "Aprobado" en sand-dark (marca DC) con el mismo size
    // aproximado del original. width("Aprobado") suele ser similar
    // a width("Borrador") en sans-serif → encaja bien.
    page.drawText("Aprobado", {
      x: m.x,
      y: m.y,
      size: m.height,
      font: helvBold,
      color: rgb(0x9b / 255, 0x82 / 255, 0x59 / 255), // C.sandDark
    });
  }

  const bytes = await pdfDoc.save();
  // bytes es Uint8Array — el cast a ArrayBuffer para Blob es seguro.
  return new Blob([bytes as unknown as ArrayBuffer], { type: "application/pdf" });
}
