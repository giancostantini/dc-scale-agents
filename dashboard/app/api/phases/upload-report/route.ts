/**
 * POST /api/phases/upload-report
 *
 * Permite al director subir un reporte de fase ya editado afuera
 * (Word, Google Docs, Markdown puro) en lugar de regenerar con
 * feedback. El archivo subido REEMPLAZA el content_md del reporte
 * y archiva la versión anterior en phase_report_history — el flujo
 * de comparación entre versiones sigue funcionando.
 *
 * Soporta:
 *  - .md / .markdown     → texto plano, va directo a content_md
 *  - .txt                → texto plano, va directo a content_md
 *  - .docx               → se convierte a markdown con mammoth+turndown
 *
 * NO soporta .pdf (la extracción de texto destruye toda la estructura;
 * mejor reexportar a docx desde el visor PDF y subir eso).
 *
 * Body: multipart/form-data
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 *   file:     File (.md|.markdown|.txt|.docx)
 *
 * Solo director. Status del reporte queda en 'draft' — el director
 * confirma o pide cambios después, igual que con una generación.
 */

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import mammoth from "mammoth";
import TurndownService from "turndown";
import { logAction } from "@/lib/audit";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — sobra para markdown/docx

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
        error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 10 MB.`,
      },
      { status: 400 },
    );
  }

  // ====== 3. Detectar formato y extraer markdown ======
  const filename = file.name.toLowerCase();
  const ext = filename.split(".").pop() ?? "";

  let contentMd: string;
  try {
    if (ext === "md" || ext === "markdown" || ext === "txt") {
      // Texto plano: usar tal cual
      contentMd = (await file.text()).trim();
    } else if (ext === "docx") {
      // Convertir docx → HTML con mammoth, luego HTML → markdown
      // con turndown. mammoth tiene una API "convertToMarkdown"
      // pero produce resultados peores (bullets como "-", sin
      // tablas decentes); HTML intermedio + turndown da output
      // más limpio para tablas/listas.
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.convertToHtml(
        { buffer },
        {
          // Mapeamos algunos estilos de Word/Docs a sus equivalentes
          // semánticos en HTML. Hacemos los más comunes.
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Subtitle'] => h2:fresh",
            "p[style-name='Heading 1'] => h2:fresh",
            "p[style-name='Heading 2'] => h3:fresh",
            "p[style-name='Heading 3'] => h4:fresh",
            "p[style-name='Quote'] => blockquote:fresh",
          ],
        },
      );
      const html = result.value;

      const turndown = new TurndownService({
        headingStyle: "atx", // ## en vez de underline
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
      });
      // Plugin manual para tablas (turndown core no las maneja bien).
      // Mantenemos formato GFM-style: | col1 | col2 |
      turndown.addRule("table", {
        filter: "table",
        replacement: function (_content, node) {
          const table = node as HTMLTableElement;
          const rows = Array.from(table.querySelectorAll("tr"));
          if (rows.length === 0) return "";
          const out: string[] = [];
          rows.forEach((row, rowIdx) => {
            const cells = Array.from(row.querySelectorAll("th, td")).map(
              (c) => (c.textContent ?? "").replace(/\|/g, "\\|").trim(),
            );
            out.push(`| ${cells.join(" | ")} |`);
            if (rowIdx === 0) {
              out.push(`| ${cells.map(() => "---").join(" | ")} |`);
            }
          });
          return "\n\n" + out.join("\n") + "\n\n";
        },
      });
      contentMd = turndown.turndown(html).trim();

      if (result.messages && result.messages.length > 0) {
        // Warnings de mammoth (estilos no reconocidos, imágenes
        // skippeadas, etc) — los logueamos pero no rompen.
        console.warn(
          "[phases.upload-report] mammoth warnings:",
          result.messages
            .slice(0, 5)
            .map((m) => m.message)
            .join("; "),
        );
      }
    } else if (ext === "html" || ext === "htm") {
      // HTML directo (raro pero a veces lo exportan así desde Docs)
      const html = await file.text();
      const turndown = new TurndownService({
        headingStyle: "atx",
        bulletListMarker: "-",
        emDelimiter: "*",
      });
      contentMd = turndown.turndown(html).trim();
    } else {
      return Response.json(
        {
          error: `Formato .${ext} no soportado. Subí .md, .txt o .docx (PDF no: re-exportá desde el visor a Word/Docs primero).`,
        },
        { status: 400 },
      );
    }
  } catch (err) {
    const e = err as Error;
    console.error("[phases.upload-report] parse error:", err);
    return Response.json(
      {
        error: `No se pudo procesar el archivo: ${e.message ?? "error desconocido"}`,
        detail: e.message,
      },
      { status: 400 },
    );
  }

  // ====== 3.5. Normalización: strippear artefactos visuales =========
  // Cuando un docx viene de un PDF re-exportado a Word (o lo edita
  // alguien y deja headers/footers visuales), el cover page, el TOC y
  // los headers/footers de página viajan como CONTENIDO en el markdown.
  // Si los persistimos, el PDF renderer los pone DENTRO del cuerpo del
  // reporte (con su propio cover encima) y el diseño queda destruido.
  //
  // Estas reglas detectan los artefactos típicos y los descartan.
  // Son agresivas adrede: en caso de duda, descartar — es contenido
  // de presentación, no de negocio.
  contentMd = normalizeUploadedMarkdown(contentMd);

  if (!contentMd || contentMd.length < 50) {
    return Response.json(
      {
        error: `El reporte extraído está vacío o es muy corto (${contentMd.length} chars). Revisá el archivo subido.`,
      },
      { status: 400 },
    );
  }

  // ====== 4. Cargar reporte actual ======
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
    .select("content_md, version, generated_at, feedback")
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

  // ====== 6. Persistir el nuevo content como draft ======
  const nextVersion = (currentReport?.version ?? 0) + 1;

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
        model: "manual-upload",
        usage: null,
        generated_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
      },
      { onConflict: "client_id,phase" },
    );

  if (upsertErr) {
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
    action: "phase.generate", // reusamos el action existente, con metadata distinto
    targetType: "phase_report",
    targetId: `${clientId}:${phase}`,
    metadata: {
      source: "manual-upload",
      filename: file.name,
      sizeBytes: file.size,
      version: nextVersion,
    },
  });

  return Response.json({
    success: true,
    clientId,
    phase,
    version: nextVersion,
    chars: contentMd.length,
  });
}

// ============================================================
// normalizeUploadedMarkdown
// ============================================================
// Saca artefactos visuales que NO deberían viajar como contenido
// del reporte: cover page, TOC, headers/footers de cada página,
// letterspacing decorativo, paginación, etc.
//
// Esta función es la primera línea de defensa contra docx "sucios"
// (típicamente: PDF → Word con conversión externa → upload). Si el
// docx viene de nuestro export-to-docx propio, ya está limpio y esta
// función solo trim ligero.
function normalizeUploadedMarkdown(md: string): string {
  // Reemplazos a nivel de texto inline ANTES de splittear por línea
  let s = md;

  // "H " usado por algunos extractores de PDF en vez de ≈
  s = s.replace(/\bH (US\$|\d)/g, "≈ $1");
  // Texto con caracteres acentuados separados ("M **ú** ltiples")
  s = s.replace(/\*\*([áéíóúñÁÉÍÓÚÑ])\*\* /g, "$1");
  // Turndown escapa "1." como "1\." dentro de headings — eso rompe la
  // detección de secciones del PDF renderer. Lo desescapamos globalmente
  // (no es ambiguo: en markdown nadie escribe legítimamente "\.").
  s = s.replace(/(\d+)\\\./g, "$1.");

  // Patrones de líneas a descartar (case-insensitive). Todas estas
  // son artefactos visuales del cover/TOC/header/footer que NO deben
  // viajar como contenido del reporte.
  const DROP_PATTERNS: RegExp[] = [
    // === Footer de paginación ===
    // "Confidencial · Dearmas Costantini · 08 de mayo de 2026 3 / 17"
    /^\s*Confidencial\s*[·•\-]\s*Dearmas\s+Costantini\s*[·•\-].*\d+\s*\/\s*\d+\s*$/i,
    /^\s*Confidencial\s*[·•\-]\s*Dearmas\s+Costantini\s*$/i,

    // === Header de cada página ===
    // "Dearmas Costantini D I A G N Ó S T I C O · WIZTRIP"
    /^\s*(\*\*)?Dearmas(\*\*)?\s+(\*\*)?Costantini(\*\*)?.*(D\s*I\s*A\s*G\s*N|E\s*S\s*T\s*R\s*A\s*T|S\s*E\s*T\s*U\s*P|L\s*A\s*N\s*Z\s*A\s*M)/i,

    // === Banner principal de marca (cover) ===
    // "**Dearmas Costantini**" o "Dearmas Costantini" solo en línea
    /^\s*(#{1,6}\s+)?(\*\*)?Dearmas(\*\*)?\s+(\*\*)?Costantini(\*\*)?\s*$/i,

    // === Subbanners del cover (con o sin letterspacing) ===
    // "BUSINESS GROWTH PARTNERS · LATAM" / "B U S I N E S S G R O W T H..."
    /^\s*(\*\*)?B(\s+|)U(\s+|)S(\s+|)I(\s+|)N(\s+|)E(\s+|)S(\s+|)S\s+G(\s+|)R(\s+|)O(\s+|)W(\s+|)T(\s+|)H\s+P(A)?(\s+|)?R(\s+|)T(\s+|)N(\s+|)E(\s+|)R(\s+|)S.*$/i,
    // "REPORTE DE FASE DEL ONBOARDING"
    /^\s*(\*\*)?R(\s+|)E(\s+|)P(\s+|)O(\s+|)R(\s+|)T(\s+|)E\s+D(\s+|)E\s+F(\s+|)A(\s+|)S(\s+|)E(\s+D(\s+|)E(\s+|)L\s+O(\s+|)N(\s+|)B(\s+|)O(\s+|)A(\s+|)R(\s+|)D(\s+|)I(\s+|)N(\s+|)G)?(\*\*)?\s*$/i,
    // "TABLA DE CONTENIDOS" o "Tabla de contenidos"
    /^\s*(\*\*)?(TA?\s*B\s*L\s*A\s+D\s*E\s+C\s*O\s*N\s*T\s*E\s*N\s*I\s*D\s*O\s*S|Tabla\s+de\s+contenidos)(\*\*)?\s*$/i,

    // === Heading "Diagnóstico" / "Estrategia" / etc del cover ===
    // Es el título grande del cover. La fase la rearma el PDF renderer.
    /^\s*#{1,3}\s+(\*\*)?(Diagnóstico|Estrategia|Setup|Lanzamiento)(\*\*)?\s*$/i,
    // Heading "Índice" del TOC
    /^\s*#{1,6}\s+(\*\*)?(Índice|Indice|Index)(\*\*)?\s*$/i,

    // === Subtítulo del reporte (cover) ===
    // "Growth Diagnosis Plan" / "Growth Strategy Plan" / etc. solo
    /^\s*Growth\s+(Diagnosis|Strategy|Setup|Launch)\s+Plan\s*$/i,

    // === Metadata del cover (CLIENTE / GENERADO / ESTADO / VERSIÓN) ===
    // Con o sin letterspacing, con o sin valor en la misma línea.
    /^\s*(\*\*)?C(\s+|)L(\s+|)I(\s+|)E(\s+|)N(\s+|)T(\s+|)E(\*\*)?(\s+\S.*)?$/i,
    /^\s*(\*\*)?G(\s+|)E(\s+|)N(\s+|)E(\s+|)R(\s+|)A(\s+|)D(\s+|)O(\*\*)?(\s+\S.*)?$/i,
    /^\s*(\*\*)?E(\s+|)S(\s+|)T(\s+|)A(\s+|)D(\s+|)O(\*\*)?(\s+\S.*)?$/i,
    /^\s*(\*\*)?V(\s+|)E(\s+|)R(\s+|)S(\s+|)I(\s+|)Ó(\s+|)N(\*\*)?(\s+\S.*)?$/i,
    /^\s*(\*\*)?A(\s+|)P(\s+|)R(\s+|)O(\s+|)B(\s+|)A(\s+|)D(\s+|)O(\*\*)?(\s+\S.*)?$/i,

    // === Estados sueltos ===
    /^\s*(\*\*)?(Borrador|Aprobado|Draft|Pending)(\*\*)?\s*$/i,
    /^\s*(\*\*)?v\d+(\*\*)?\s*$/i,

    // === Texto de descripción del TOC ===
    /^\s*Recorrido\s+de\s+las\s+\d+\s+secciones.*$/i,
    /^\s*\d+\s+secciones\s*[·•\-]\s*recorrido.*$/i,

    // === Header del docx que generamos nosotros ===
    /^\s*(\*\*)?DEARMAS\s+COSTANTINI\s*[·•\-]\s*BUSINESS\s+GROWTH\s+PARTNERS(\*\*)?\s*$/i,
    /^\s*(\*\*)?(DIAGNÓSTICO|ESTRATEGIA|SETUP|LANZAMIENTO)\s*[·•\-]\s*.+?\s*[·•\-]\s*v\d+\s*(\*\*)?$/i,

    // === Nudge del docx editable ===
    /^\s*\*?Editá\s+libremente\s+este\s+documento.*$/i,

    // === Líneas decorativas / hr ===
    /^\s*[-*_]{3,}\s*$/,
  ];

  // Bloques completos a descartar: detección de TOC.
  // Un TOC típico se ve como:
  //   ## Índice  (o "Tabla de contenidos")
  //   01 Resumen ejecutivo
  //   02 Contexto del negocio
  //   ... (lineas tipo "NN Section Name")
  // Removemos desde un heading "Índice"/"Tabla de contenidos" hasta el
  // primer heading "## N. Section" o "# 1. Section".
  //
  // Strategy: line-by-line con un flag "inside TOC".

  const lines = s.split("\n");
  const cleaned: string[] = [];
  let insideToc = false;

  // Patrón de heading TOC. Tolera bold "**Índice**" porque turndown
  // a veces lo emite así.
  const TOC_HEADING =
    /^(#{1,6})\s+(\*\*)?\s*(Índice|Indice|Tabla\s+de\s+contenidos|Table\s+of\s+contents)\s*(\*\*)?\s*$/i;
  // Patrón de entrada de TOC: "01 Resumen ejecutivo" o "1 Section name" o "**01** Section name"
  const TOC_ENTRY =
    /^\s*(\*\*)?(\d{1,2})(\*\*)?\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][\w\s,áéíóúñÁÉÍÓÚÑüÜ\-\.\&\/\(\)]{2,80}\s*$/;
  // Patrón de heading real de sección (el que rompe el TOC)
  const SECTION_HEADING = /^#{1,6}\s+(\d+)\.\s+/;
  // Patrón de heading "Recorrido de las N secciones"
  const TOC_SUBTITLE = /^\s*Recorrido\s+de\s+las\s+\d+\s+secciones/i;

  // Heading "Índice" como un solo bold sin #, sin /: variante
  // que turndown puede producir si el style en docx era "Title"
  // en vez de "Heading"
  const TOC_HEADING_BOLD =
    /^\s*(\*\*)?(Índice|Indice|Tabla\s+de\s+contenidos)(\*\*)?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Detectar inicio de TOC ANTES de los DROP_PATTERNS, porque
    //    si los DROP_PATTERNS comen el "## Índice" sin avisar, las
    //    entradas del TOC abajo quedarían huérfanas y se persisten.
    if (TOC_HEADING.test(trimmed) || TOC_HEADING_BOLD.test(trimmed)) {
      insideToc = true;
      continue;
    }

    // 2. Si estamos dentro del TOC: descartar entradas hasta que
    //    aparezca una sección numerada real (## 1. ...) o un
    //    heading no-TOC.
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
      // Drop entradas TOC, subtítulos y líneas vacías
      if (TOC_ENTRY.test(trimmed) || TOC_SUBTITLE.test(trimmed) || !trimmed) {
        continue;
      }
      // Línea inesperada: salir conservadoramente
      insideToc = false;
      cleaned.push(line);
      continue;
    }

    // 3. Drop patterns puntuales (cover/footer/header artifacts)
    if (DROP_PATTERNS.some((p) => p.test(trimmed))) {
      continue;
    }

    cleaned.push(line);
  }

  let out = cleaned.join("\n");

  // Colapsar 3+ líneas en blanco a 2 (markdown standard)
  out = out.replace(/\n{3,}/g, "\n\n");
  // Trim general
  out = out.trim();

  return out;
}
