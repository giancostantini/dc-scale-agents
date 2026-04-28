"use client";

/**
 * PDF text extraction client-side con pdfjs-dist (Mozilla).
 *
 * Extrae solo el texto del PDF — descarta imágenes y layouts. Para
 * brandbooks típicos (con muchas imágenes hi-res), eso significa que un
 * PDF de 400 MB se reduce a ~30-100 KB de texto puro, que es lo que
 * realmente alimenta a los agentes.
 *
 * Este módulo es client-only (`use client`) — pdfjs-dist usa Workers y
 * APIs del browser. No funciona en Vercel Edge ni Node SSR.
 *
 * Uso:
 *   const text = await extractPdfText(file, (msg) => console.log(msg));
 */

interface PdfJsLib {
  getDocument: (src: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{ str?: string }>;
        }>;
      }>;
    }>;
  };
  GlobalWorkerOptions: { workerSrc: string };
  version: string;
}

let cachedLib: PdfJsLib | null = null;

async function loadPdfJs(): Promise<PdfJsLib> {
  if (cachedLib) return cachedLib;

  // Dynamic import — pdfjs-dist es ~300 KB y no queremos forzar carga
  // hasta que el usuario realmente intente extraer un PDF.
  const lib = (await import("pdfjs-dist")) as unknown as PdfJsLib;

  // Worker setup. pdfjs requires a separate worker file. Apuntamos al CDN
  // oficial de la misma versión para no tener que copiar el .mjs al public/.
  // Si la red está caída, el worker falla y la extracción tira error claro.
  if (typeof window !== "undefined" && lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`;
  }

  cachedLib = lib;
  return lib;
}

export async function extractPdfText(
  file: File,
  onProgress?: (message: string) => void,
): Promise<string> {
  if (!file) throw new Error("file requerido");

  onProgress?.("Cargando librería de PDF…");
  const pdfjs = await loadPdfJs();

  onProgress?.("Leyendo archivo…");
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.("Procesando PDF…");
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const totalPages = doc.numPages;
  const pages: string[] = [];

  for (let n = 1; n <= totalPages; n++) {
    onProgress?.(`Extrayendo página ${n} de ${totalPages}…`);
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => (typeof item.str === "string" ? item.str : ""))
      .filter((s) => s.length > 0)
      .join(" ");
    pages.push(pageText);
  }

  onProgress?.("Listo");
  return pages.join("\n\n").trim();
}
