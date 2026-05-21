/**
 * POST /api/phases/review
 *
 * Genera un análisis crítico del reporte de fase: fortalezas,
 * debilidades / huecos, y riesgos antes de aprobar. Lo guarda en
 * phase_reports.review_md para no regenerarlo en cada page view.
 *
 * Body:
 *   clientId: string
 *   phase:    "diagnostico" | "estrategia" | "setup" | "lanzamiento"
 *   force?:   boolean — si true, regenera aunque ya exista uno cacheado.
 *
 * Solo director.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { CLAUDE_MODEL_OPUS } from "@/lib/anthropic-model";

// Vercel route config: el análisis crítico también es largo, le damos
// hasta 300s. Default de Pro es 60s y muchos reviews lo pasan.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const PHASES = ["diagnostico", "estrategia", "setup", "lanzamiento"] as const;
type PhaseKey = (typeof PHASES)[number];

const PHASE_LABELS: Record<PhaseKey, string> = {
  diagnostico: "Diagnóstico",
  estrategia: "Estrategia",
  setup: "Setup",
  lanzamiento: "Lanzamiento",
};

// Expectativas por fase para que el análisis sea consciente del contexto.
const EXPECTED_SECTIONS: Record<PhaseKey, string[]> = {
  diagnostico: [
    "Resumen ejecutivo",
    "Contexto del negocio",
    "Mercado y panorama competitivo",
    "Cliente y propuesta de valor",
    "Métricas y unit economics",
    "Hallazgos clave",
    "Recomendaciones estratégicas",
    "Impacto esperado",
    "Conclusión y próximos pasos",
  ],
  estrategia: [
    "Resumen ejecutivo del lanzamiento",
    "Objetivos del lanzamiento",
    "Definición del público objetivo",
    "Propuesta de valor",
    "Posicionamiento y narrativa de marca",
    "Estrategia de canales digitales",
    "Funnel de lanzamiento",
    "Plan de contenidos",
    "Estrategia de paid media",
    "Estrategia de influencers y alianzas",
    "Estrategia comercial y promocional",
    "Cronograma de lanzamiento",
    "Presupuesto estimado",
    "Dashboard y reporting",
    "Riesgos y plan de contingencia",
    "Conclusiones y próximos pasos",
  ],
  setup: [
    "Resumen ejecutivo",
    "Setup técnico",
    "Tracking",
    "Estructura de cuentas",
    "Creativos",
    "Conclusión",
  ],
  lanzamiento: [
    "Resumen ejecutivo",
    "Plan de lanzamiento",
    "Activación de canales",
    "Medición",
    "Próximos pasos",
  ],
};

const REVIEW_SYSTEM = `Sos un revisor crítico interno de reportes de consultoría de Dearmas Costantini (D&C). Tu trabajo: ayudar al director a detectar huecos ANTES de mostrarle el reporte al cliente.

Estilo:
- Voz directa, rioplatense, sin floritura.
- Punteo. Concreto sobre abstracto.
- Sin "sinergia", "valor agregado", "potenciar".
- Si algo está bien, decilo en una línea. No infles.
- Si algo está flojo, sé específico: "el bullet X dice Y pero no cita fuente" no "falta sustento".

Output: markdown. Estructura fija:

## Fortalezas
3-4 bullets máximo. Lo que el director puede defender frente al cliente sin titubear.

## Huecos / debilidades
3-5 bullets. Cosas concretas que faltan, datos sin fuente, generalidades vacías, secciones débiles, métricas sin contexto.

## Riesgo de aprobar tal cual
1-2 oraciones. Si el director aprueba esto y se lo manda al cliente, ¿qué puede objetar el cliente o quedar mal?

## Sugerencia accionable
1-2 cosas concretas que el director puede pedir como cambio antes de aprobar.

NO uses preámbulos. NO digas "este reporte es...". Arrancá directo con "## Fortalezas".`;

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!url || !anonKey || !serviceKey || !anthropicKey) {
    return Response.json({ error: "Servidor no configurado" }, { status: 500 });
  }

  const callerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!callerToken) return Response.json({ error: "Sin sesión" }, { status: 401 });

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();
  if (!caller) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "director") {
    return Response.json({ error: "Solo directores" }, { status: 403 });
  }

  let body: { clientId?: string; phase?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const { clientId, phase, force } = body;
  if (!clientId || !phase) {
    return Response.json({ error: "Faltan clientId o phase" }, { status: 400 });
  }
  if (!(PHASES as readonly string[]).includes(phase)) {
    return Response.json({ error: "phase inválido" }, { status: 400 });
  }
  const phaseKey = phase as PhaseKey;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: report } = await admin
    .from("phase_reports")
    .select("content_md, review_md, version")
    .eq("client_id", clientId)
    .eq("phase", phaseKey)
    .maybeSingle();

  if (!report || !report.content_md) {
    return Response.json(
      { error: "El reporte no tiene contenido para analizar." },
      { status: 400 },
    );
  }

  // Si ya hay análisis cacheado y no se forzó regenerar → devolverlo
  if (report.review_md && !force) {
    return Response.json({
      success: true,
      review_md: report.review_md,
      cached: true,
    });
  }

  const { data: client } = await admin
    .from("clients")
    .select("name, sector")
    .eq("id", clientId)
    .maybeSingle();

  const expected = EXPECTED_SECTIONS[phaseKey] ?? [];

  const userPrompt = `Reporte de **${PHASE_LABELS[phaseKey]}** para el cliente **${client?.name ?? clientId}** (sector: ${client?.sector ?? "—"}).

Secciones esperadas para esta fase:
${expected.map((s, i) => `${(i + 1).toString().padStart(2, "0")}. ${s}`).join("\n")}

---

REPORTE A REVISAR:

${report.content_md}

---

Generá el análisis siguiendo la estructura del system prompt.`;

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  let reviewMd: string;
  try {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL_OPUS,
      max_tokens: 2500,
      system: REVIEW_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = resp.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("Respuesta vacía de Claude.");
    }
    reviewMd = block.text.trim();
  } catch (err) {
    console.error("[phases.review] Claude error:", err);
    const e = err as { message?: string };
    return Response.json(
      {
        error: "No se pudo generar el análisis.",
        detail: e.message ?? String(err),
      },
      { status: 500 },
    );
  }

  // Guardar en cache
  const { error: upErr } = await admin
    .from("phase_reports")
    .update({ review_md: reviewMd })
    .eq("client_id", clientId)
    .eq("phase", phaseKey);
  if (upErr) {
    console.warn("[phases.review] cache save failed:", upErr.message);
  }

  return Response.json({
    success: true,
    review_md: reviewMd,
    cached: false,
  });
}
