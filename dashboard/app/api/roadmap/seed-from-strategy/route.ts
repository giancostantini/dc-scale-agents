/**
 * POST /api/roadmap/seed-from-strategy
 *
 * Alimenta el roadmap del cliente desde el "Growth Strategy Plan"
 * aprobado. Llama a Claude para extraer JSON estructurado del markdown
 * y persistirlo en:
 *  - clients.content_frequency
 *  - clients.content_mix
 *  - clients.roadmap_month_notes
 *  - cal_events (eventos type='pauta' / 'contenido' / 'reporte' con
 *    fechas reales)
 *
 * Idempotente: borra los eventos previos marcados como auto-generados
 * (notes que empiezan con "[Auto-estrategia]") antes de insertar los
 * nuevos. Así el director puede regenerar sin duplicar.
 *
 * Body:
 *   clientId: string
 *   launchDate?: "YYYY-MM-DD" — fecha de referencia para resolver
 *      "semana 0", "semana -2", etc. Default = hoy.
 *
 * Solo director.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { CLAUDE_MODEL_OPUS } from "@/lib/anthropic-model";
import { recordApiUsage } from "@/lib/api-usage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Marker que se guarda en cal_events.notes para identificar eventos
 *  generados automáticamente desde la estrategia. Lo usamos para
 *  borrarlos en el próximo seed sin afectar los manuales. */
const AUTO_MARKER = "[Auto-estrategia]";

interface ExtractedFrequency {
  ig_feed?: number;
  ig_story?: number;
  ig_reel?: number;
  tt_video?: number;
  tt_story?: number;
  in_feed?: number;
  fb_feed?: number;
  fb_story?: number;
  fb_reel?: number;
  yt_video?: number;
  yt_short?: number;
}

interface ExtractedMixOne {
  valor?: number;
  oferta?: number;
  engagement?: number;
}
interface ExtractedMix {
  ig?: ExtractedMixOne;
  tt?: ExtractedMixOne;
  in?: ExtractedMixOne;
  fb?: ExtractedMixOne;
  yt?: ExtractedMixOne;
}

interface ExtractedEvent {
  title: string;
  type: "pauta" | "contenido" | "reunion" | "reporte" | "dev";
  date: string;             // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD or null
  notes?: string | null;
}

interface Extracted {
  content_frequency: ExtractedFrequency;
  content_mix: ExtractedMix;
  events: ExtractedEvent[];
  month_notes: Record<string, string>;
}

// ============================================================
// System prompt para la extracción
// ============================================================
const EXTRACTION_SYSTEM = `Sos un agente de extracción de datos para Dearmas Costantini. Recibís el "Growth Strategy Plan" aprobado de un cliente y devolvés un JSON estructurado para alimentar su Roadmap operativo (calendario + frecuencia + mix + eventos).

Tu output DEBE ser ÚNICAMENTE un objeto JSON válido. Sin comentarios, sin preámbulos tipo "Aquí está el JSON", sin code fences \`\`\`json. Empieza con { y terminá con }.

SCHEMA EXACTO (todos los campos son obligatorios — usá [] o {} vacíos si no hay info):

{
  "content_frequency": {
    "ig_feed":  0,  "ig_story": 0,  "ig_reel": 0,
    "tt_video": 0,  "tt_story": 0,
    "in_feed":  0,
    "fb_feed":  0,  "fb_story": 0,  "fb_reel": 0,
    "yt_video": 0,  "yt_short": 0
  },
  "content_mix": {
    "ig": { "valor": 0, "oferta": 0, "engagement": 0 },
    "tt": { "valor": 0, "oferta": 0, "engagement": 0 },
    "in": { "valor": 0, "oferta": 0, "engagement": 0 },
    "fb": { "valor": 0, "oferta": 0, "engagement": 0 },
    "yt": { "valor": 0, "oferta": 0, "engagement": 0 }
  },
  "events": [
    {
      "title": "string corto",
      "type": "pauta" | "contenido" | "reunion" | "reporte" | "dev",
      "date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD" | null,
      "notes": "string corto explicando objetivo del evento" | null
    }
  ],
  "month_notes": {
    "YYYY-MM": "texto markdown 4-8 líneas: campaña activa, foco de contenido, pauta corriendo, hitos del mes, etc"
  }
}

REGLAS DE EXTRACCIÓN:

1. content_frequency (basado en sección 8 "Plan de contenidos"):
   - Por cada combo red + formato, cuántas publicaciones por semana.
   - Si la estrategia dice "3 reels semanales" → ig_reel: 3.
   - Si dice "2 posts en LinkedIn por semana" → in_feed: 2.
   - Si una red no se menciona, dejá los valores en 0.

2. content_mix (basado en la naturaleza del contenido descrito):
   - Por cada red activa (con frecuencia > 0), inferí % de contenido
     "valor" (educativo, expertise), "oferta" (promo, comercial,
     descuento), "engagement" (conversacional, comunidad, BTS).
   - Los 3 valores tienen que sumar 100 por red.
   - Inferí del tono y los ejemplos descriptos en sección 5 (narrativa)
     y 8 (pilares + formatos).
   - Si no se puede inferir bien para una red, usar 60/25/15 como default.

3. events: extraé los hitos concretos del cronograma + batches de
   paid media. Importante — fechas REALES en YYYY-MM-DD:
   - Si la estrategia menciona "semana -4 al lanzamiento" → calculá
     respecto a la fecha de lanzamiento que vas a recibir como input.
   - Si menciona fechas absolutas ("desde 15/05 hasta 30/06") usalas.
   - Eventos type "pauta": cada batch de campaña de sección 9 con
     start_date + end_date (rango de cuándo corre el batch).
     Ej: { title: "Batch 1 · Awareness frío IG/FB", type: "pauta",
          date: "2026-06-01", end_date: "2026-06-14",
          notes: "Reels 9:18 con hook visual. KPI: CPM <US$4." }
   - Eventos type "contenido": hitos de producción / shootings /
     entregas creativas si los menciona el cronograma.
   - Eventos type "reporte": momentos de medición / revisión.
   - Eventos type "reunion": kickoffs / revisiones con cliente.
   - Eventos type "dev": deploys / lanzamientos técnicos.
   - Mínimo 5 eventos. Máximo 30 (priorizá los más estructurales).

4. month_notes: para cada mes que cubre la estrategia (basado en
   sección 12 "Cronograma" y 1.5 "Duración"), 4-8 líneas en español
   rioplatense en formato prosa (no bullets) explicando:
   - Cuál es la campaña principal de ese mes.
   - Foco editorial (qué tipo de contenido prioritario).
   - Qué pauta está corriendo.
   - Hitos comerciales o de producción.
   - Tono / voz dominante.
   Cubrí mínimo 3 meses, máximo 12. Key en formato "YYYY-MM" (ej: "2026-06").

REGLAS DE CALIDAD:
- Fechas siempre YYYY-MM-DD (sin tiempo, sin timezone). end_date
  puede ser null para eventos de un solo día.
- Si no podés calcular una fecha con certeza, NO inventes — usá la
  fecha de lanzamiento que recibís como referencia.
- No metas eventos genéricos tipo "Trabajar en contenido". Solo
  hitos concretos con fechas y objetivos.
- Los month_notes son prosa narrativa fluida, no bullets sueltos.`;

export async function POST(req: NextRequest) {
  // ====== 1. Env checks ======
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!url || !anonKey || !serviceKey || !anthropicKey) {
    return Response.json(
      { error: "Servidor no configurado (Supabase / Anthropic faltan)." },
      { status: 500 },
    );
  }

  // ====== 2. Auth: director only ======
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
      { error: "Solo directores pueden poblar el roadmap." },
      { status: 403 },
    );
  }

  // ====== 3. Body ======
  let body: { clientId?: string; launchDate?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  const { clientId } = body;
  const launchDate =
    body.launchDate && /^\d{4}-\d{2}-\d{2}$/.test(body.launchDate)
      ? body.launchDate
      : new Date().toISOString().slice(0, 10);

  if (!clientId) {
    return Response.json({ error: "Falta clientId." }, { status: 400 });
  }

  // ====== 4. Cargar estrategia aprobada ======
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr || !client) {
    return Response.json(
      { error: "Cliente no encontrado." },
      { status: 404 },
    );
  }

  const { data: strategyReport } = await admin
    .from("phase_reports")
    .select("content_md, status, version")
    .eq("client_id", clientId)
    .eq("phase", "estrategia")
    .maybeSingle();

  if (!strategyReport || !strategyReport.content_md) {
    return Response.json(
      {
        error:
          "El cliente no tiene reporte de estrategia generado todavía. Primero generá y aprobá la fase Estrategia.",
      },
      { status: 400 },
    );
  }
  if (strategyReport.status !== "approved") {
    return Response.json(
      {
        error: `La estrategia tiene status "${strategyReport.status}" — necesita estar aprobada antes de poblar el roadmap.`,
      },
      { status: 400 },
    );
  }

  // ====== 5. Llamar Claude para extraer ======
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const userPrompt = `Cliente: ${client.name}
Fecha de lanzamiento de referencia: ${launchDate}

A continuación va el "Growth Strategy Plan" aprobado en markdown. Extraé el JSON según el schema indicado en tu system prompt. Recordá: solo el objeto JSON, nada más.

---

${strategyReport.content_md}`;

  let claudeResponse;
  try {
    claudeResponse = await anthropic.messages.create({
      model: CLAUDE_MODEL_OPUS,
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: EXTRACTION_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    console.error("[seed-from-strategy] Claude error:", err);
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        {
          error: `Claude API · ${err.status ?? "?"}`,
          detail: err.message,
        },
        { status: err.status ?? 500 },
      );
    }
    const e = err as { message?: string };
    return Response.json(
      { error: "Error inesperado extrayendo la estrategia.", detail: e.message ?? String(err) },
      { status: 500 },
    );
  }

  const textBlock = claudeResponse.content.find((b) => b.type === "text");
  const rawJson =
    textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

  // ====== 6. Parsear + validar JSON ======
  let extracted: Extracted;
  try {
    // Tolerancia a fences accidentales: limpiar ```json ... ``` o ``` ... ```
    const cleaned = rawJson
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    extracted = JSON.parse(cleaned) as Extracted;
  } catch (err) {
    console.error("[seed-from-strategy] JSON parse error:", err);
    console.error("[seed-from-strategy] Raw response (truncated):", rawJson.slice(0, 2000));
    return Response.json(
      {
        error: "Claude devolvió un JSON inválido.",
        detail: (err as Error).message,
        preview: rawJson.slice(0, 500),
      },
      { status: 500 },
    );
  }

  // Sanity checks blandos
  if (!extracted.content_frequency || typeof extracted.content_frequency !== "object") {
    extracted.content_frequency = {};
  }
  if (!extracted.content_mix || typeof extracted.content_mix !== "object") {
    extracted.content_mix = {};
  }
  if (!Array.isArray(extracted.events)) {
    extracted.events = [];
  }
  if (!extracted.month_notes || typeof extracted.month_notes !== "object") {
    extracted.month_notes = {};
  }

  // Validar fechas en eventos — descartamos los inválidos en vez de fallar todo
  const validEvents = extracted.events.filter((ev) => {
    const okDate =
      typeof ev.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ev.date);
    const okEnd =
      ev.end_date === null ||
      ev.end_date === undefined ||
      (typeof ev.end_date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(ev.end_date) &&
        ev.end_date >= ev.date);
    const okType = ["pauta", "contenido", "reunion", "reporte", "dev"].includes(
      ev.type,
    );
    const okTitle = typeof ev.title === "string" && ev.title.trim().length > 0;
    return okDate && okEnd && okType && okTitle;
  });

  // ====== 7. Persistir ======
  // 7a. Borrar eventos previos auto-generados
  const { error: delErr } = await admin
    .from("cal_events")
    .delete()
    .eq("client_id", clientId)
    .ilike("notes", `${AUTO_MARKER}%`);
  if (delErr) {
    console.warn("[seed-from-strategy] delete previous auto events:", delErr.message);
  }

  // 7b. Insertar eventos nuevos
  let createdEvents = 0;
  if (validEvents.length > 0) {
    const rows = validEvents.map((ev) => ({
      title: ev.title.trim().slice(0, 200),
      type: ev.type,
      date: ev.date,
      end_date: ev.end_date ?? null,
      time: "10:00",
      duration: 60,
      client_id: clientId,
      client_label: client.name,
      participants: null,
      notes: `${AUTO_MARKER} ${(ev.notes ?? "").trim()}`.trim().slice(0, 1000),
      meet_link: null,
      synced: false,
      source: "manual",
    }));
    const { error: insErr, count } = await admin
      .from("cal_events")
      .insert(rows, { count: "exact" });
    if (insErr) {
      console.error("[seed-from-strategy] insert events:", insErr);
      return Response.json(
        {
          error: "No se pudieron insertar los eventos del roadmap.",
          detail: insErr.message,
        },
        { status: 500 },
      );
    }
    createdEvents = count ?? rows.length;
  }

  // 7c. Actualizar content_frequency, content_mix, roadmap_month_notes
  //     Limpiamos zeros del freq antes de guardar para no contaminar.
  const cleanFreq: Record<string, number> = {};
  for (const [k, v] of Object.entries(extracted.content_frequency)) {
    if (typeof v === "number" && v > 0) cleanFreq[k] = v;
  }
  // Mix: solo redes con freq > 0 + saneamiento numérico
  const activeNetworks = new Set<string>();
  for (const k of Object.keys(cleanFreq)) {
    const net = k.split("_")[0];
    activeNetworks.add(net);
  }
  const cleanMix: Record<string, ExtractedMixOne> = {};
  for (const [net, m] of Object.entries(extracted.content_mix)) {
    if (!activeNetworks.has(net)) continue;
    cleanMix[net] = {
      valor: Math.max(0, Math.min(100, Number(m?.valor ?? 0))),
      oferta: Math.max(0, Math.min(100, Number(m?.oferta ?? 0))),
      engagement: Math.max(0, Math.min(100, Number(m?.engagement ?? 0))),
    };
  }
  // Month notes: filtrar keys no válidas
  const cleanNotes: Record<string, string> = {};
  for (const [k, v] of Object.entries(extracted.month_notes)) {
    if (/^\d{4}-\d{2}$/.test(k) && typeof v === "string" && v.trim()) {
      cleanNotes[k] = v.trim();
    }
  }

  const { error: updErr } = await admin
    .from("clients")
    .update({
      content_frequency: cleanFreq,
      content_mix: cleanMix,
      roadmap_month_notes: cleanNotes,
    })
    .eq("id", clientId);
  if (updErr) {
    console.error("[seed-from-strategy] update client:", updErr);
    return Response.json(
      {
        error: "Eventos creados pero no se pudo actualizar el cliente.",
        detail: updErr.message,
      },
      { status: 500 },
    );
  }

  await recordApiUsage({
    source: "dashboard:roadmap-seed",
    clientId,
    model: claudeResponse.model,
    usage: claudeResponse.usage,
  });

  return Response.json({
    success: true,
    events_created: createdEvents,
    frequency_keys: Object.keys(cleanFreq).length,
    mix_networks: Object.keys(cleanMix).length,
    month_notes_count: Object.keys(cleanNotes).length,
    strategy_version: strategyReport.version,
    usage: {
      input: claudeResponse.usage.input_tokens,
      output: claudeResponse.usage.output_tokens,
    },
  });
}
