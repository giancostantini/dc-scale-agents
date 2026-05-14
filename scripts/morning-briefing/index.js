/**
 * Morning Briefing Agent
 *
 * Dos modos:
 *
 *  A) Per-user (preferido — usado por el widget global del consultor):
 *     Brief: { userId: string, runId?: number }
 *     Genera briefing personalizado según el rol del user (director / team)
 *     y sus preferencias en consultant_memory_v2. Persiste el resultado
 *     como un mensaje is_briefing=true en la pinned conversation del user
 *     (consultant_conversations + consultant_messages).
 *
 *  B) Per-client (legacy — todavía soportado mientras el dashboard del
 *     cliente puede dispararlo manualmente):
 *     Brief: { client: string, runId?: number, mode?: string }
 *     Genera briefing del cliente leyendo el vault y lo registra como
 *     `agent_outputs` (output_type='report').
 *
 * El agente falla ruidoso si no recibe userId ni client.
 *
 * Usage:
 *   node scripts/morning-briefing/index.js --brief /tmp/brief.json
 *   node scripts/morning-briefing/index.js <client>           # legacy CLI
 *
 * Programmatic:
 *   import { run } from "./index.js";
 *   await run({ userId: "uuid", runId: 42 });
 *   await run({ client: "wiztrip" });
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  logAgentRun,
  logAgentError,
  updateAgentRun,
  registerAgentOutput,
  pushNotification,
} from "../lib/supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");
const AGENT = "morning-briefing";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();

const MODEL_CLIENT_BRIEFING = "claude-sonnet-4-6"; // legacy mode
const MODEL_USER_BRIEFING = "claude-opus-4-7";     // per-user, más nuanced

const TITLE_MAX_CHARS = 60;

// ---------------------------------------------------------------------------
// Inline Supabase REST helpers — necesitamos más flexibilidad que la del
// lib compartido (que es curated para writes). Solo usamos en este archivo.
// ---------------------------------------------------------------------------

function pgHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Prefer: "return=representation",
  };
}

async function pgGet(table, queryString) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${queryString}`, {
    headers: pgHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase GET ${table} failed: ${err}`);
  }
  return await res.json();
}

async function pgInsert(table, row) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: pgHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase INSERT ${table} failed: ${err}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function pgPatch(table, filterQs, patch) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filterQs}`, {
    method: "PATCH",
    headers: pgHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase PATCH ${table} failed: ${err}`);
  }
  return await res.json();
}

// ---------------------------------------------------------------------------
// Common utilities
// ---------------------------------------------------------------------------

function readVaultFile(relativePath) {
  try {
    return readFileSync(resolve(VAULT, relativePath), "utf-8");
  } catch {
    return null;
  }
}

function loadBriefFromArgs() {
  const args = process.argv.slice(2);
  const briefFlagIdx = args.indexOf("--brief");
  if (briefFlagIdx !== -1 && args[briefFlagIdx + 1]) {
    const path = resolve(process.cwd(), args[briefFlagIdx + 1]);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  }
  // Legacy positional: client slug (sin default)
  const positional = args.filter((a) => !a.startsWith("--"))[0];
  return positional ? { client: positional } : {};
}

async function callClaude(model, prompt, maxTokens = 1500) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no configurada");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// ---------------------------------------------------------------------------
// Entry — switch by mode
// ---------------------------------------------------------------------------

export async function run(briefInput) {
  const brief = briefInput ?? loadBriefFromArgs();
  if (brief.userId) {
    return await runUserBriefing(brief);
  }
  if (brief.client) {
    return await runClientBriefing(brief);
  }
  throw new Error(
    `[${AGENT}] brief debe incluir userId (modo per-user) o client (modo legacy).`,
  );
}

// ===========================================================================
// MODE A — Per-user briefing (preferred)
// ===========================================================================

async function runUserBriefing(brief) {
  const startTime = Date.now();
  const { userId, runId = null } = brief;
  if (!userId || typeof userId !== "string") {
    throw new Error(`[${AGENT}] userId inválido.`);
  }

  console.log(`[${AGENT}] starting user mode for userId=${userId}`);

  // 1. Profile
  const profiles = await pgGet(
    "profiles",
    `id=eq.${userId}&select=id,email,name,role,permissions&limit=1`,
  );
  const profile = profiles[0];
  if (!profile) throw new Error(`[${AGENT}] profile ${userId} no encontrado`);
  if (profile.role !== "director" && profile.role !== "team") {
    throw new Error(
      `[${AGENT}] role=${profile.role} no soportado (solo director/team).`,
    );
  }

  // 2. Client assignments (solo si team)
  let assignments = [];
  if (profile.role === "team") {
    assignments = await pgGet(
      "client_assignments",
      `user_id=eq.${userId}&select=client_id`,
    );
  }
  const accessibleClientIds = assignments.map((a) => a.client_id);

  // 3. User memory (scope=user) — preferencias del miembro del team
  const userMemory = await pgGet(
    "consultant_memory_v2",
    `scope_type=eq.user&user_id=eq.${userId}&or=(expires_at.is.null,expires_at.gt.now())&order=importance.desc,created_at.desc&limit=20&select=kind,content,importance`,
  );

  // 4. Contexto operativo según rol
  const ctx = await loadOperationalContext(profile.role, accessibleClientIds);

  // 5. Llamar Claude
  const prompt = buildUserBriefingPrompt({
    profile,
    assignments,
    userMemory,
    ctx,
  });
  console.log(`[${AGENT}] calling Claude (${MODEL_USER_BRIEFING})...`);
  const briefing = await callClaude(MODEL_USER_BRIEFING, prompt, 1800);

  // 6. Encontrar o crear la pinned conversation del user (scope=global)
  const conv = await ensureUserPinnedConversation(userId, profile.name);

  // 7. Insertar el mensaje is_briefing
  await pgInsert("consultant_messages", {
    conversation_id: conv.id,
    role: "assistant",
    content: briefing,
    is_welcome: false,
    is_briefing: true,
  });

  // 8. Update conversation.updated_at
  await pgPatch(
    "consultant_conversations",
    `id=eq.${conv.id}`,
    { updated_at: new Date().toISOString() },
  );

  // 9. Log + notif
  const summary = `Briefing personalizado para ${profile.name} (${profile.role})`;
  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary,
      summary_md: briefing,
      performance: { duration_ms: Date.now() - startTime, mode: "user" },
    });
  } else {
    await logAgentRun(
      null, // no hay cliente específico para este briefing
      AGENT,
      "success",
      summary,
      { userId, mode: "user" },
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(
    null, // no client — es notif global del user
    "info",
    "Tu briefing del día",
    `Buen día ${profile.name.split(" ")[0]} — abrí el consultor para verlo.`,
    {
      agent: AGENT,
      to_user_id: userId,
    },
  );

  console.log(`[${AGENT}] user briefing done for ${profile.name}.`);

  return {
    userId,
    role: profile.role,
    runId,
    body_md: briefing,
    summary,
  };
}

async function ensureUserPinnedConversation(userId, userName) {
  // Look up existing pinned global conv
  const existing = await pgGet(
    "consultant_conversations",
    `user_id=eq.${userId}&scope=eq.global&is_pinned=is.true&limit=1&select=id,title`,
  );
  if (existing.length > 0) return existing[0];

  // Create new pinned conv
  const created = await pgInsert("consultant_conversations", {
    scope: "global",
    user_id: userId,
    client_id: null,
    is_pinned: true,
    title: `Conversación con ${userName}`,
  });
  return created;
}

// ---------------------------------------------------------------------------
// Operational context loading
// ---------------------------------------------------------------------------

async function loadOperationalContext(role, accessibleClientIds) {
  const isDirector = role === "director";
  const todayIso = new Date().toISOString();
  const yesterdayIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Build filter substring para queries cross-cliente
  // - director: sin filtro
  // - team: in.(slug1,slug2,...) — si no hay clientes accesibles, vacío
  const teamHasAccess = !isDirector && accessibleClientIds.length > 0;
  const clientFilter = isDirector
    ? ""
    : teamHasAccess
    ? `&client=in.(${accessibleClientIds.join(",")})`
    : null; // null indica "team sin clientes" → queries vacías

  if (clientFilter === null) {
    return {
      clients: [],
      recentErrors: [],
      openRequests: [],
      upcomingEvents: [],
      kpiSnapshots: [],
    };
  }

  // Filtro para tablas con client_id (no `client`)
  const clientIdFilter = isDirector
    ? ""
    : `&client_id=in.(${accessibleClientIds.join(",")})`;

  const [clients, recentErrors, openRequests, upcomingEvents] = await Promise.all([
    isDirector
      ? pgGet(
          "clients",
          `select=id,name,sector,type,status,phase&order=name`,
        )
      : accessibleClientIds.length === 0
      ? Promise.resolve([])
      : pgGet(
          "clients",
          `id=in.(${accessibleClientIds.join(",")})&select=id,name,sector,type,status,phase&order=name`,
        ),
    pgGet(
      "agent_runs",
      `status=eq.error&created_at=gte.${yesterdayIso}${clientFilter}&order=created_at.desc&limit=15&select=client,agent,summary,created_at`,
    ),
    pgGet(
      "client_requests",
      `status=in.(pending,reviewing)${clientIdFilter}&order=submitted_at.desc&limit=15&select=client_id,type,title,status,urgency,submitted_at`,
    ),
    pgGet(
      "cal_events",
      `date=gte.${todayIso.slice(0, 10)}${clientIdFilter}&order=date.asc&limit=10&select=client_id,title,date,time,type`,
    ).catch(() => []),
  ]);

  return {
    clients,
    recentErrors,
    openRequests,
    upcomingEvents,
    kpiSnapshots: [], // KPI deltas requiere lectura cross-snapshot — deferred
  };
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildUserBriefingPrompt({ profile, assignments, userMemory, ctx }) {
  const today = new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const role = profile.role;
  const firstName = profile.name.split(" ")[0];

  const memoryBlock = userMemory.length === 0
    ? "(sin preferencias guardadas — primer briefing personalizado)"
    : userMemory
        .map((m) => `- [${m.kind}, p${m.importance}] ${m.content}`)
        .join("\n");

  const clientsBlock = ctx.clients.length === 0
    ? "- (sin clientes accesibles)"
    : ctx.clients
        .map((c) => `- ${c.id} · ${c.name} (${c.sector ?? "—"}, ${c.phase ?? "—"}, ${c.status ?? "—"})`)
        .join("\n");

  const errorsBlock = ctx.recentErrors.length === 0
    ? "(sin errores en las últimas 24h)"
    : ctx.recentErrors
        .map((e) => `- ${e.client} · ${e.agent} · ${e.summary?.slice(0, 100) ?? ""}`)
        .join("\n");

  const requestsBlock = ctx.openRequests.length === 0
    ? "(sin solicitudes abiertas)"
    : ctx.openRequests
        .map((r) => `- [${r.urgency}] ${r.client_id} · ${r.type} · ${r.title} · ${r.status}`)
        .join("\n");

  const eventsBlock = ctx.upcomingEvents.length === 0
    ? "(sin reuniones próximas)"
    : ctx.upcomingEvents
        .map((e) => `- ${e.date}${e.time ? ` ${e.time}` : ""} · ${e.client_id} · ${e.title} (${e.type})`)
        .join("\n");

  const roleInstruction = role === "director"
    ? `Sos co-fundador de D&C Scale Partners. Hablás con ${firstName}, otro co-fundador (rol director).
Tu briefing tiene que ser estratégico:
- Resumir el estado de la operación: qué clientes están activos, fase de cada uno, alertas críticas.
- Listar errores recientes de agentes (si los hay) y proponer acción.
- Sintetizar solicitudes pendientes (urgencia + cliente).
- Marcar reuniones del día y próximos hitos.
- Si hay decisiones que el director debería tomar (asignación, escalamiento, priorización), señalalas.
- Tono: directo, sin endulzar. Como diría un partner técnico.`
    : `${firstName} es team member de D&C Scale Partners. Tiene asignados estos clientes: ${assignments.map((a) => a.client_id).join(", ") || "ninguno todavía"}.

Tu briefing tiene que ser operativo:
- Para cada cliente asignado: 1-2 líneas con qué pasa hoy (lo nuevo desde ayer, qué requiere acción).
- Lista clara de tareas/solicitudes del día (priorizadas).
- Reuniones donde tiene que estar.
- Si hay algo que tiene que escalarle al director, señalalo.
- NO hables de finanzas, leads, ni de clientes que NO le están asignados.
- Tono: cordial, accionable, sin sobrar.`;

  return `Sos el Consultor de D&C Scale Partners. Hoy es ${today}.

Estás armando el briefing matutino para ${firstName} (${role}).

PERFIL Y PREFERENCIAS DEL USER:
- Nombre: ${profile.name}
- Email: ${profile.email}
- Rol: ${role}

MEMORIA APRENDIDA SOBRE ${firstName.toUpperCase()}:
${memoryBlock}

INSTRUCCIONES SEGÚN ROL:
${roleInstruction}

---

CONTEXTO OPERATIVO DE HOY:

Clientes accesibles:
${clientsBlock}

Errores de agentes últimas 24h:
${errorsBlock}

Solicitudes abiertas (pending/reviewing):
${requestsBlock}

Reuniones próximas:
${eventsBlock}

---

FORMATO DEL BRIEFING:
- Markdown limpio.
- Arrancá saludando con primer nombre y mencionando el día.
- Estructurá con secciones: foco del día, alertas (si las hay), agenda, qué requiere acción tuya.
- Máximo ~600 palabras. Concreto. No inventes datos: si una sección no tiene info, decilo.
- Aplicá las preferencias del user si las hay (tono, formato, qué le importa primero).
- Voz rioplatense, directa. Prohibido: "sinergia", "potenciar", "transformar", "valor agregado", "ecosistema".

Generá el briefing ahora.`;
}

// ===========================================================================
// MODE B — Per-client briefing (legacy)
// ===========================================================================

async function runClientBriefing(brief) {
  const startTime = Date.now();
  const {
    client,
    runId = null,
    vaultContext = null,
    triggered_by_user_id = null,
  } = brief;
  if (!client || typeof client !== "string" || !client.trim()) {
    throw new Error(
      `[${AGENT}] client slug missing — brief must include a 'client' string (no hay defaults)`,
    );
  }
  console.log(`[${AGENT}] starting (legacy client mode) for client='${client}' runId=${runId}`);

  const base = `clients/${client}`;
  const clientContext =
    vaultContext?.claudeClient ?? readVaultFile(`${base}/claude-client.md`);
  const learningLog =
    vaultContext?.learningLog ?? readVaultFile(`${base}/learning-log.md`);
  const metricsLog = readVaultFile(`${base}/metrics-log.md`);
  const contentCalendar = readVaultFile(`${base}/content-calendar.md`);

  const today = new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `Eres el Morning Briefing Agent de D&C Scale Partners.

Tu trabajo es generar un briefing matutino conciso para el equipo sobre el cliente '${client}'.

Fecha de hoy: ${today}

--- CONTEXTO DEL CLIENTE (claude-client.md) ---
${clientContext || "Sin contexto de cliente cargado aún."}

--- LEARNING LOG ---
${learningLog || "Sin aprendizajes registrados aún."}

--- METRICAS ---
${metricsLog || "Sin métricas registradas aún."}

--- CALENDARIO DE CONTENIDO ---
${contentCalendar || "Sin calendario de contenido aún."}

---

Genera un briefing matutino en Markdown simple. Estructura:

*☀️ Morning Briefing — ${client}*
_${today}_

📊 *Resumen de métricas* (si hay datos, sino indicá que faltan)
📝 *Contenido pendiente hoy* (si hay calendario, sino sugerí prioridades)
💡 *Recordatorio clave* (del learning log o una sugerencia táctica)
🎯 *Foco del día* (una acción concreta para hoy)

Sé directo, útil y breve. Máximo 800 caracteres. Basate en el contexto del cliente; si falta info, indicalo sin inventar datos.`;

  console.log(`[${AGENT}] calling Claude (${MODEL_CLIENT_BRIEFING})...`);
  const briefing = await callClaude(MODEL_CLIENT_BRIEFING, prompt, 1024);

  const shortSummary = `Briefing matutino generado para ${client}`;

  await registerAgentOutput(runId, client, AGENT, {
    output_type: "report",
    title: `Morning Briefing — ${today}`,
    body_md: briefing,
    structured: { date: today, char_count: briefing.length },
  });

  if (runId) {
    await updateAgentRun(runId, {
      status: "success",
      summary: shortSummary,
      summary_md: briefing,
      performance: { duration_ms: Date.now() - startTime, mode: "client" },
    });
  } else {
    await logAgentRun(
      client,
      AGENT,
      "success",
      shortSummary,
      {},
      { duration_ms: Date.now() - startTime },
    );
  }

  await pushNotification(client, "info", `Morning briefing listo`, shortSummary, {
    agent: AGENT,
    link: `/cliente/${client}/planificador`,
    to_user_id: triggered_by_user_id,
  });

  console.log(`[${AGENT}] done (client mode).`);

  return {
    client,
    runId,
    body_md: briefing,
    summary: shortSummary,
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  run().catch(async (err) => {
    console.error(`[${AGENT}] failed:`, err.message);
    const brief = (() => {
      try {
        return loadBriefFromArgs();
      } catch {
        return {};
      }
    })();
    const targetClient = brief.client ?? null;
    await logAgentError(targetClient, AGENT, err, { userId: brief.userId ?? null });
    if (brief.runId) {
      await updateAgentRun(brief.runId, { status: "error", summary: err.message });
    }
    await pushNotification(
      targetClient,
      "error",
      `Morning briefing falló`,
      err.message,
      {
        agent: AGENT,
        to_user_id: brief.userId ?? brief.triggered_by_user_id ?? null,
      },
    );
    process.exit(1);
  });
}
