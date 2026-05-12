/**
 * POST /api/phases/upload-report
 *
 * Permite al director subir un reporte de fase editado afuera —
 * típicamente un PDF que retocó visualmente en una herramienta de
 * diseño (Affinity, Figma, Photoshop, Canva, etc).
 *
 * El PDF subido es CANÓNICO: cuando el director descarga el reporte
 * o cuando el cliente lo ve en su portal, se sirve este PDF tal
 * cual. NO se regenera ni se vuelve a renderizar.
 *
 * Para que los agentes (regeneración con feedback, comparación de
 * versiones, contexto para fases posteriores) puedan seguir
 * trabajando con el contenido, también se extrae el texto del PDF
 * y se guarda como `content_md`. La extracción se hace en el cliente
 * con pdfjs y viaja como un campo extra del multipart.
 *
 * Formatos aceptados:
 *   .pdf  — flujo principal (queda canónico en Storage)
 *   .md / .markdown / .txt — markdown plano (no hay PDF asociado;
 *                            el download generará desde el markdown)
 *
 * Body (multipart/form-data):
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 *   file:     File (.pdf | .md | .markdown | .txt)
 *   extractedText: string (REQUERIDO si file es .pdf)
 *
 * Solo director. Status queda en 'draft'.
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { logAction } from "@/lib/audit";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — los PDFs editados pueden ser grandes
const STORAGE_BUCKET = "client-onboarding";

export async function POST(req: NextRequest) {
  // ====== 1. Env + auth ======
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return Response.json(
      { error: "Servidor no configurado." },
      { status: 500 },
    );
  }

  const callerToken = req.headers
    .get("authorization")
    ?.replace("Bearer ", "");
  if (!callerToken) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json(
      { error: "Solo directores pueden subir reportes." },
      { status: 403 },
    );
  }

  // ====== 2. Parse multipart ======
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json(
      { error: "Body inválido (multipart/form-data esperado)" },
      { status: 400 },
    );
  }

  const clientId = formData.get("clientId");
  const phase = formData.get("phase");
  const file = formData.get("file");
  const extractedText = formData.get("extractedText");

  if (typeof clientId !== "string" || typeof phase !== "string") {
    return Response.json(
      { error: "Faltan clientId o phase" },
      { status: 400 },
    );
  }
  if (!(PHASES as readonly string[]).includes(phase)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "Archivo vacío" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      {
        error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 50 MB.`,
      },
      { status: 400 },
    );
  }

  // ====== 3. Detectar formato ======
  const filename = file.name.toLowerCase();
  const ext = filename.split(".").pop() ?? "";

  let contentMd: string;
  let pdfBuffer: Buffer | null = null;

  if (ext === "pdf") {
    // El PDF queda canónico. El texto viene extraído del cliente
    // (con pdfjs-dist en el browser, ver lib/pdf-extract.ts).
    if (typeof extractedText !== "string" || extractedText.trim().length < 50) {
      return Response.json(
        {
          error:
            "El PDF no tiene texto suficiente para que los agentes lo lean. " +
            "Si es un PDF escaneado (solo imagen), abrilo en Word/Docs primero " +
            "para que tenga capa de texto antes de exportar.",
        },
        { status: 400 },
      );
    }
    contentMd = normalizeUploadedMarkdown(extractedText);
    pdfBuffer = Buffer.from(await file.arrayBuffer());
  } else if (ext === "md" || ext === "markdown" || ext === "txt") {
    contentMd = normalizeUploadedMarkdown((await file.text()).trim());
  } else {
    return Response.json(
      {
        error: `Formato .${ext} no soportado. Subí .pdf (recomendado, queda canónico para descarga) o .md/.txt (texto plano).`,
      },
      { status: 400 },
    );
  }

  if (!contentMd || contentMd.length < 50) {
    return Response.json(
      {
        error: `El reporte extraído está vacío o es muy corto (${contentMd.length} chars). Revisá el archivo subido.`,
      },
      { status: 400 },
    );
  }

  // ====== 4. Cargar reporte actual + cliente ======
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: client } = await admin
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const { data: currentReport } = await admin
    .from("phase_reports")
    .select("content_md, version, generated_at, feedback, pdf_path")
    .eq("client_id", clientId)
    .eq("phase", phase)
    .maybeSingle();

  // ====== 5. Archivar versión anterior (si hay) ======
  if (currentReport?.content_md && currentReport?.version) {
    const { error: archiveErr } = await admin
      .from("phase_report_history")
      .upsert(
        {
          client_id: clientId,
          phase,
          version: currentReport.version,
          content_md: currentReport.content_md,
          feedback: currentReport.feedback ?? null,
          generated_at:
            currentReport.generated_at ?? new Date().toISOString(),
          archived_by: caller.id,
          pdf_path: currentReport.pdf_path ?? null,
        },
        { onConflict: "client_id,phase,version" },
      );
    if (archiveErr) {
      console.warn(
        "[phases.upload-report] archivar versión anterior falló:",
        archiveErr.message,
      );
    }
  }

  // ====== 6. Si hay PDF, subirlo a Storage ======
  const nextVersion = (currentReport?.version ?? 0) + 1;
  let pdfPath: string | null = null;

  if (pdfBuffer) {
    pdfPath = `${clientId}/phase-reports/${phase}/v${nextVersion}.pdf`;
    const { error: uploadErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(pdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadErr) {
      return Response.json(
        {
          error: `No se pudo subir el PDF al storage: ${uploadErr.message}`,
        },
        { status: 500 },
      );
    }
  }

  // ====== 7. Persistir el nuevo reporte como draft ======
  const { error: upsertErr } = await admin
    .from("phase_reports")
    .upsert(
      {
        client_id: clientId,
        phase,
        status: "draft",
        content_md: contentMd,
        feedback: null,
        version: nextVersion,
        model: pdfBuffer ? "manual-upload-pdf" : "manual-upload-text",
        usage: null,
        generated_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
        pdf_path: pdfPath,
      },
      { onConflict: "client_id,phase" },
    );

  if (upsertErr) {
    // Si falló el upsert pero el PDF ya quedó en Storage, lo intentamos
    // limpiar para no dejar huérfanos.
    if (pdfPath) {
      await admin.storage
        .from(STORAGE_BUCKET)
        .remove([pdfPath])
        .catch(() => {});
    }
    return Response.json(
      {
        error: `No se pudo guardar el reporte: ${upsertErr.message}`,
      },
      { status: 500 },
    );
  }

  await logAction({
    actorId: caller.id,
    actorEmail: caller.email ?? null,
    action: "phase.generate",
    targetType: "phase_report",
    targetId: `${clientId}:${phase}`,
    metadata: {
      source: pdfBuffer ? "manual-upload-pdf" : "manual-upload-text",
      filename: file.name,
      sizeBytes: file.size,
      version: nextVersion,
      pdfPath,
    },
  });

  return Response.json({
    success: true,
    clientId,
    phase,
    version: nextVersion,
    chars: contentMd.length,
    pdfPath,
  });
}

// ============================================================
// normalizeUploadedMarkdown
// ============================================================
// Strippea artefactos visuales del PDF original (header de cada
// página, footer de paginación, cover, TOC). Esto es relevante
// para el texto extraído del PDF — el PDF en sí ya está visualmente
// armado, no se renderiza desde el markdown.
//
// El markdown limpio sirve a los agentes (regeneración con feedback,
// diff entre versiones, contexto para fases siguientes).
function normalizeUploadedMarkdown(md: string): string {
  let s = md;

  // Substituciones de glifos comunes que rompen extractores
  s = s.replace(/\bH (US\$|\d)/g, "≈ $1");
  // Escapes "1\." que algunos extractores meten dentro de headings
  s = s.replace(/(\d+)\\\./g, "$1.");

  // Patrones de líneas a descartar — artefactos típicos del PDF
  // que NO deben viajar como contenido del reporte.
  const DROP_PATTERNS: RegExp[] = [
    // Footer de paginación
    /^\s*Confidencial\s*[·•\-]\s*Dearmas\s+Costantini\s*[·•\-].*\d+\s*\/\s*\d+\s*$/i,
    /^\s*Confidencial\s*[·•\-]\s*Dearmas\s+Costantini\s*$/i,
    // Header de cada página
    /^\s*(\*\*)?Dearmas(\*\*)?\s+(\*\*)?Costantini(\*\*)?.*(D\s*I\s*A\s*G\s*N|E\s*S\s*T\s*R\s*A\s*T|S\s*E\s*T\s*U\s*P|L\s*A\s*N\s*Z\s*A\s*M)/i,
    // Banner solo del cover
    /^\s*(#{1,6}\s+)?(\*\*)?Dearmas(\*\*)?\s+(\*\*)?Costantini(\*\*)?\s*$/i,
    // Subbanners letterspaceados típicos del cover
    /^\s*(\*\*)?B(\s+|)U(\s+|)S(\s+|)I(\s+|)N(\s+|)E(\s+|)S(\s+|)S\s+G(\s+|)R(\s+|)O(\s+|)W(\s+|)T(\s+|)H\s+P(A)?(\s+|)?R(\s+|)T(\s+|)N(\s+|)E(\s+|)R(\s+|)S.*$/i,
    /^\s*(\*\*)?R(\s+|)E(\s+|)P(\s+|)O(\s+|)R(\s+|)T(\s+|)E\s+D(\s+|)E\s+F(\s+|)A(\s+|)S(\s+|)E(\s+D(\s+|)E(\s+|)L\s+O(\s+|)N(\s+|)B(\s+|)O(\s+|)A(\s+|)R(\s+|)D(\s+|)I(\s+|)N(\s+|)G)?(\*\*)?\s*$/i,
    /^\s*(\*\*)?(TA?\s*B\s*L\s*A\s+D\s*E\s+C\s*O\s*N\s*T\s*E\s*N\s*I\s*D\s*O\s*S|Tabla\s+de\s+contenidos)(\*\*)?\s*$/i,
    // Heading "Diagnóstico/Estrategia/Setup/Lanzamiento" del cover
    /^\s*#{1,3}\s+(\*\*)?(Diagnóstico|Estrategia|Setup|Lanzamiento)(\*\*)?\s*$/i,
    // Subtítulo "Growth X Plan"
    /^\s*Growth\s+(Diagnosis|Strategy|Setup|Launch)\s+Plan\s*$/i,
    // Metadata CLIENTE / GENERADO / ESTADO / VERSIÓN (con o sin letterspacing)
    /^\s*(\*\*)?C(\s+|)L(\s+|)I(\s+|)E(\s+|)N(\s+|)T(\s+|)E(\*\*)?(\s+\S.*)?$/i,
    /^\s*(\*\*)?G(\s+|)E(\s+|)N(\s+|)E(\s+|)R(\s+|)A(\s+|)D(\s+|)O(\*\*)?(\s+\S.*)?$/i,
    /^\s*(\*\*)?E(\s+|)S(\s+|)T(\s+|)A(\s+|)D(\s+|)O(\*\*)?(\s+\S.*)?$/i,
    /^\s*(\*\*)?V(\s+|)E(\s+|)R(\s+|)S(\s+|)I(\s+|)Ó(\s+|)N(\*\*)?(\s+\S.*)?$/i,
    /^\s*(\*\*)?A(\s+|)P(\s+|)R(\s+|)O(\s+|)B(\s+|)A(\s+|)D(\s+|)O(\*\*)?(\s+\S.*)?$/i,
    // Estados sueltos
    /^\s*(\*\*)?(Borrador|Aprobado|Draft|Pending)(\*\*)?\s*$/i,
    /^\s*(\*\*)?v\d+(\*\*)?\s*$/i,
    // Texto descriptivo del TOC
    /^\s*Recorrido\s+de\s+las\s+\d+\s+secciones.*$/i,
    /^\s*\d+\s+secciones\s*[·•\-]\s*recorrido.*$/i,
    // Líneas decorativas
    /^\s*[-*_]{3,}\s*$/,
  ];

  const TOC_HEADING =
    /^(#{1,6})\s+(\*\*)?\s*(Índice|Indice|Tabla\s+de\s+contenidos|Table\s+of\s+contents)\s*(\*\*)?\s*$/i;
  const TOC_HEADING_BOLD =
    /^\s*(\*\*)?(Índice|Indice|Tabla\s+de\s+contenidos)(\*\*)?\s*$/i;
  const TOC_ENTRY =
    /^\s*(\*\*)?(\d{1,2})(\*\*)?\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][\w\s,áéíóúñÁÉÍÓÚÑüÜ\-\.\&\/\(\)]{2,80}\s*$/;
  const SECTION_HEADING = /^#{1,6}\s+(\d+)\.\s+/;
  const TOC_SUBTITLE = /^\s*Recorrido\s+de\s+las\s+\d+\s+secciones/i;

  const lines = s.split("\n");
  const cleaned: string[] = [];
  let insideToc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (TOC_HEADING.test(trimmed) || TOC_HEADING_BOLD.test(trimmed)) {
      insideToc = true;
      continue;
    }

    if (insideToc) {
      if (SECTION_HEADING.test(line)) {
        insideToc = false;
        cleaned.push(line);
        continue;
      }
      if (/^#{1,6}\s+/.test(line) && !TOC_HEADING.test(line)) {
        insideToc = false;
        cleaned.push(line);
        continue;
      }
      if (TOC_ENTRY.test(trimmed) || TOC_SUBTITLE.test(trimmed) || !trimmed) {
        continue;
      }
      insideToc = false;
      cleaned.push(line);
      continue;
    }

    if (DROP_PATTERNS.some((p) => p.test(trimmed))) continue;

    cleaned.push(line);
  }

  let out = cleaned.join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.trim();
  return out;
}
