"use client";

/**
 * Compresor de PDF browser-side.
 *
 * Recibe un File de un PDF y devuelve otro File comprimido. Si el PDF
 * ya está bajo el threshold, lo devuelve sin tocar.
 *
 * Estrategia: re-rasteriza cada página a 150 DPI y la guarda como JPEG
 * quality 75 dentro de un PDF nuevo. Pierde texto seleccionable pero
 * Claude lo lee perfecto con su OCR multimodal.
 *
 * Performance:
 *   - 50 MB PDF (30 págs) → ~10s, output ~5 MB
 *   - 380 MB PDF (63 págs) → ~60s, output ~13 MB
 *
 * Memory: ~80-150 MB peak (cargamos el PDF entero, pero las páginas
 * se procesan secuencialmente y se liberan).
 *
 * No anda en SSR — pdfjs-dist requiere Workers del browser.
 */

const TARGET_DPI = 150;
const JPEG_QUALITY = 0.75;
const COMPRESS_THRESHOLD_MB = 32; // límite Claude API

/**
 * Si el PDF supera el threshold, lo comprime. Si no, lo devuelve tal cual.
 */
export async function compressPdfIfNeeded(
  file: File,
  onProgress?: (info: { phase: string; pct: number; message: string }) => void,
  options?: { thresholdMb?: number; targetDpi?: number; jpegQuality?: number },
): Promise<File> {
  const threshold = options?.thresholdMb ?? COMPRESS_THRESHOLD_MB;
  const sizeMb = file.size / (1024 * 1024);

  if (file.type !== "application/pdf") {
    return file; // solo comprimimos PDFs
  }
  if (sizeMb <= threshold) {
    return file; // ya entra en Claude
  }

  onProgress?.({
    phase: "load",
    pct: 0,
    message: `Comprimiendo PDF (${sizeMb.toFixed(1)} MB)…`,
  });

  return await compressPdf(file, {
    targetDpi: options?.targetDpi ?? TARGET_DPI,
    jpegQuality: options?.jpegQuality ?? JPEG_QUALITY,
    onProgress,
  });
}

interface CompressOptions {
  targetDpi: number;
  jpegQuality: number;
  onProgress?: (info: { phase: string; pct: number; message: string }) => void;
}

async function compressPdf(file: File, opts: CompressOptions): Promise<File> {
  // Carga lazy — pdfjs-dist y pdf-lib no funcionan en SSR.
  const pdfjs = (await import("pdfjs-dist")) as unknown as {
    getDocument: (src: { data: ArrayBuffer }) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<PdfJsPage>;
      }>;
    };
    GlobalWorkerOptions: { workerSrc: string };
    version: string;
  };
  const { PDFDocument } = await import("pdf-lib");

  // Worker — usar el bundleado del paquete.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  opts.onProgress?.({
    phase: "render",
    pct: 0,
    message: `Procesando ${numPages} páginas…`,
  });

  // Crear el PDF nuevo
  const newPdf = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);

    // Calcular el viewport para el DPI objetivo.
    // PDF default = 72 DPI. Scale = targetDpi / 72.
    const scale = opts.targetDpi / 72;
    const viewport = page.getViewport({ scale });

    // Renderizar a canvas
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No se pudo crear canvas 2D");
    }
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas: canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    // Encodear a JPEG
    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob fail"))),
        "image/jpeg",
        opts.jpegQuality,
      );
    });
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

    // Embeber en el PDF nuevo
    const jpegImage = await newPdf.embedJpg(jpegBytes);

    // Tamaño de la página original (en puntos PDF, 72 DPI)
    const originalViewport = page.getViewport({ scale: 1 });
    const newPage = newPdf.addPage([originalViewport.width, originalViewport.height]);
    newPage.drawImage(jpegImage, {
      x: 0,
      y: 0,
      width: originalViewport.width,
      height: originalViewport.height,
    });

    // Liberar memoria del canvas
    canvas.width = 0;
    canvas.height = 0;

    const pct = Math.round((pageNum / numPages) * 90);
    opts.onProgress?.({
      phase: "render",
      pct,
      message: `Página ${pageNum}/${numPages}`,
    });
  }

  opts.onProgress?.({ phase: "save", pct: 95, message: "Guardando…" });

  const compressedBytes = await newPdf.save({ useObjectStreams: true });

  const originalName = file.name.replace(/\.pdf$/i, "");
  const newName = `${originalName}_LITE.pdf`;
  const compressedFile = new File(
    [compressedBytes as BlobPart],
    newName,
    {
      type: "application/pdf",
      lastModified: Date.now(),
    },
  );

  opts.onProgress?.({
    phase: "done",
    pct: 100,
    message: `${(file.size / (1024 * 1024)).toFixed(1)} MB → ${(compressedFile.size / (1024 * 1024)).toFixed(1)} MB`,
  });

  return compressedFile;
}

interface PdfJsPage {
  numPages?: number;
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
}
