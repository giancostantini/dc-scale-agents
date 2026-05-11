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
