/**
 * POST /api/phases/generate
 *
 * Genera un reporte de fase del onboarding (diagnostico/estrategia/
 * setup/lanzamiento) usando Claude. Lee el kickoff PDF (si está
 * cargado), el onboarding del cliente, y los reportes anteriores
 * aprobados. Devuelve markdown estructurado y lo persiste en
 * phase_reports con status='draft'.
 *
 * Body:
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 *   feedback: string (opcional — si está, regenera con feedback)
 *
 * Requisitos server:
 *   ANTHROPIC_API_KEY              — para llamar Claude
 *   SUPABASE_SERVICE_ROLE_KEY      — para leer kickoff del bucket
 *                                    privado y escribir phase_reports
 *                                    bypaseando RLS
 *   NEXT_PUBLIC_SUPABASE_URL       — URL de Supabase
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  — para verificar JWT del caller
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  PHASE_PROMPTS,
  buildPhaseUserPrompt,
  type PhaseGenerationInput,
} from "./prompts";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;
type PhaseKey = (typeof PHASES)[number];

const PHASE_DEPS: Record<PhaseKey, PhaseKey | null> = {
  diagnostico: null,
  estrategia: "diagnostico",
  setup: "estrategia",
  lanzamiento: "setup",
};

export async function POST(req: NextRequest) {
  // ====== 1. Env checks ======
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!url || !anonKey) {
    return Response.json(
      { error: "Supabase no configurado en el server." },
      { status: 500 },
    );
  }
  if (!serviceKey) {
    return Response.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY no configurada. Sin esto no se puede leer el kickoff del bucket privado ni guardar el reporte.",
      },
      { status: 500 },
    );
  }
  if (!anthropicKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY no configurada en el server." },
      { status: 500 },
    );
  }

  // ====== 2. Validar caller (debe ser director) ======
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
      { error: "Solo directores pueden generar reportes." },
      { status: 403 },
    );
  }

  // ====== 3. Validar body ======
  let body: { clientId?: string; phase?: string; feedback?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }

  const { clientId, phase, feedback } = body;
  if (!clientId || !phase) {
    return Response.json(
      { error: "Faltan clientId o phase" },
      { status: 400 },
    );
  }
  if (!PHASES.includes(phase as PhaseKey)) {
    return Response.json(
      { error: `phase debe ser uno de: ${PHASES.join(", ")}` },
      { status: 400 },
    );
  }
  const phaseKey = phase as PhaseKey;

  // ====== 4. Cargar cliente con onboarding ======
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select(
      "id, name, sector, type, fee, method, country, contact_name, contact_email, contact_phone, fee_variable, modules, onboarding",
    )
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr || !client) {
    return Response.json(
      { error: "Cliente no encontrado" },
      { status: 404 },
    );
  }

  // ====== 5. Validar precondición: la fase anterior debe estar approved ======
  const dep = PHASE_DEPS[phaseKey];
  let previousReports: { phase: PhaseKey; content_md: string }[] = [];
  if (dep) {
    const { data: prevList } = await admin
      .from("phase_reports")
      .select("phase, status, content_md")
      .eq("client_id", clientId)
      .in("status", ["approved"])
      .in("phase", PHASES.slice(0, PHASES.indexOf(phaseKey)));
    previousReports = (prevList ?? [])
      .filter((r) => r.content_md)
      .map((r) => ({ phase: r.phase as PhaseKey, content_md: r.content_md! }));

    const depMet = previousReports.some((r) => r.phase === dep);
    if (!depMet) {
      return Response.json(
        {
          error: `Fase bloqueada: necesitás aprobar primero "${dep}".`,
        },
        { status: 400 },
      );
    }
  }

  // ====== 6. Marcar status='generating' ======
  await admin
    .from("phase_reports")
    .upsert(
      {
        client_id: clientId,
        phase: phaseKey,
        status: "generating",
        feedback: feedback ?? null,
      },
      { onConflict: "client_id,phase" },
    );

  // ====== 7. Bajar el kickoff del bucket si está cargado ======
  let kickoffPdfBase64: string | null = null;
  let kickoffMime: string | null = null;
  let kickoffName: string | null = null;
  const onboarding = (client.onboarding ?? {}) as Record<string, unknown>;
  const kickoffMeta = onboarding.kickoffFile;

  if (kickoffMeta && typeof kickoffMeta === "object" && "path" in kickoffMeta) {
    const meta = kickoffMeta as { path: string; name?: string; type?: string };
    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from("client-onboarding")
        .download(meta.path);
      if (dlErr) {
        console.warn("kickoff download failed:", dlErr);
      } else if (blob) {
        const arrayBuf = await blob.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        kickoffPdfBase64 = buf.toString("base64");
        kickoffMime = meta.type || blob.type || "application/pdf";
        kickoffName = meta.name ?? "kickoff.pdf";
      }
    } catch (err) {
      console.warn("kickoff download exception:", err);
    }
  }

  // ====== 8. Llamar Claude ======
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const promptCfg = PHASE_PROMPTS[phaseKey];
  const input: PhaseGenerationInput = {
    client: {
      name: client.name,
      sector: client.sector,
      type: client.type as "gp" | "dev",
      fee: typeof client.fee === "string" ? parseFloat(client.fee) : client.fee,
      method: client.method,
      country: client.country ?? null,
      modules: (client.modules ?? {}) as Record<string, boolean>,
      contactName: client.contact_name ?? null,
    },
    onboarding,
    previousReports,
    feedback: feedback ?? null,
    kickoffName,
  };

  const userPrompt = buildPhaseUserPrompt(phaseKey, input);

  // Content blocks: [doc del kickoff?, texto del prompt]
  const userContent: Anthropic.Messages.ContentBlockParam[] = [];
  if (kickoffPdfBase64 && kickoffMime?.includes("pdf")) {
    userContent.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: kickoffPdfBase64,
      },
    } as Anthropic.Messages.ContentBlockParam);
  }
  userContent.push({ type: "text", text: userPrompt });

  let claudeResponse;
  try {
    claudeResponse = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: promptCfg.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: userContent }],
    });
  } catch (err) {
    // Marcar como pending para que el director pueda reintentar
    await admin
      .from("phase_reports")
      .update({ status: "pending" })
      .eq("client_id", clientId)
      .eq("phase", phaseKey);

    console.error("Claude API error:", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY inválida." },
        { status: 401 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Rate limit. Esperá unos segundos y reintenta." },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Claude API: ${err.message}` },
        { status: err.status ?? 500 },
      );
    }
    return Response.json({ error: "Error generando." }, { status: 500 });
  }

  const textBlock = claudeResponse.content.find((b) => b.type === "text");
  const contentMd =
    textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;

  if (!contentMd) {
    await admin
      .from("phase_reports")
      .update({ status: "pending" })
      .eq("client_id", clientId)
      .eq("phase", phaseKey);
    return Response.json(
      { error: "Claude devolvió respuesta vacía" },
      { status: 500 },
    );
  }

  // ====== 9. Persistir el reporte como draft ======
  // bumpear version si ya existía
  const { data: existing } = await admin
    .from("phase_reports")
    .select("version")
    .eq("client_id", clientId)
    .eq("phase", phaseKey)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + (feedback ? 1 : 0) || 1;

  const usage = {
    input: claudeResponse.usage.input_tokens,
    output: claudeResponse.usage.output_tokens,
    cacheCreation: claudeResponse.usage.cache_creation_input_tokens ?? 0,
    cacheRead: claudeResponse.usage.cache_read_input_tokens ?? 0,
  };

  await admin
    .from("phase_reports")
    .upsert(
      {
        client_id: clientId,
        phase: phaseKey,
        status: "draft",
        content_md: contentMd,
        feedback: null, // limpiamos el feedback cuando regeneramos
        version: nextVersion,
        model: claudeResponse.model,
        usage,
        generated_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
      },
      { onConflict: "client_id,phase" },
    );

  return Response.json({
    success: true,
    clientId,
    phase: phaseKey,
    version: nextVersion,
    usage,
    contentMd,
  });
}
