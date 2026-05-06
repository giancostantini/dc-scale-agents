# dc-scale-agents

AI agent system for D&C Scale Partners — growth marketing + automation agency.

## Quick context

- **Agency:** D&C Scale Partners (Gianluca + Federico, co-founders)
- **Active clients:** se cargan vía dashboard (tabla `clients` de Supabase). Cliente actual de prueba con vault completo: **`wiztrip`** (agencia de viajes Uruguay). Nunca hardcodear clientes en scripts.
- **Markets:** Uruguay + Latam (Colombia, Perú, Paraguay)
- **Verticals:** (1) Marketing growth (content, SEO, ads), (2) Automatización (agentes IA operando en autopilot)

## Read these BEFORE making any changes

1. [`vault/CLAUDE.md`](vault/CLAUDE.md) — master agency context (stack, principios, prioridades)
2. [`vault/agents/`](vault/agents/) — specs detallados de cada agente (uno por carpeta)
3. [`CONTRIBUTING.md`](CONTRIBUTING.md) — branching, PRs, commits
4. Contexto de cliente: `vault/clients/<slug>/claude-client.md` (lo genera el agente `client-bootstrap` desde templates en `vault/automation/templates/`)

## Repo structure

| Folder | Purpose |
|---|---|
| `scripts/` | Lógica de agentes (Node.js, ES modules). Cada carpeta = un agente. Entrypoint `index.js` recibe `--brief /path/to/brief.json` |
| `scripts/lib/` | Utilities compartidas: `supabase.js` (logAgentRun, registerAgentOutput, pushNotification), `brand-loader.js`, `asset-sync.js` |
| `vault/` | Obsidian vault — source of truth para todo el contexto no-código (specs, logs, datos por cliente) |
| `dashboard/` | Dashboard web (Next.js 16 + React 19 + Supabase + Anthropic SDK, deployado a Vercel) — ver `dashboard/CLAUDE.md` |
| `remotion-studio/` | Producción de video con Remotion (lo usa `content-creator`) |
| `.github/workflows/` | Scheduling y triggers de agentes (reemplaza n8n) |

## Estado de los 9 agentes (post-auditoría 2026-05)

| # | Agente | Modelo Claude | Status vs Wiztrip | Notas |
|---|---|---|---|---|
| 1 | `morning-briefing` | claude-sonnet-4-6 | ✅ Ready | Telegram opcional |
| 2 | `content-strategy` | claude-sonnet-4-6 | ✅ Ready | Genera calendario + briefs JSON |
| 3 | `content-creator` | claude-sonnet-4-6 | ✅ Ready (con retry) | TSX para Remotion. Retry de 3 intentos si Claude emite código inválido |
| 4 | `seo` | claude-sonnet-4-6 | ✅ Ready | Append a `seo-library.md` |
| 5 | `reporting-performance` | claude-sonnet-4-6 | ✅ Ready | Stubs de `ads-log`/`sales-log`/`product-catalog` ya creados |
| 6 | `social-media-metrics` | claude-sonnet-4-6 | ✅ Ready | Hook database se crea on-the-fly al primer winner |
| 7 | `stock` | claude-sonnet-4-6 | ⚠️ N/A para WizTrip (agencia, no ecommerce) | Funciona si se carga `stock-log.md` |
| 8 | `logistics` | claude-sonnet-4-6 | ⚠️ N/A para WizTrip | Trigger a stock vía repository_dispatch |
| 9 | `client-bootstrap` | (no usa Claude) | ✅ Ready | Scaffold del vault desde templates |
| + | `brandbook-processor` | claude-sonnet-4-6 | ✅ Ready (con retry + validación) | Procesa brandbook → 8 archivos en `brand/` |

**Reglas de "ready":**
- Validó env vars al arranque
- Maneja errores de API (Anthropic, ElevenLabs, etc.) con retry o fallback claro
- Crea directorios padres antes de escribir (mkdirSync recursive)
- Loggea a Supabase (`agent_runs`, `agent_outputs`, `notifications`)
- No tiene defaults de cliente hardcodeados

## Cliente actual: WizTrip

`vault/clients/wiztrip/` (cliente de prueba — agencia de viajes Uruguay).

**Archivos presentes:**
- Core: `claude-client.md`, `strategy.md`, `content-library.md`, `content-calendar.md`
- Brand (8 archivos): `brand/{visual-identity, voice-character, voice-decision, voice-operational, positioning, assets, content-formats, photography, restrictions}.md`
- Logs: `metrics-log.md`, `learning-log.md`, `performance-log.md`, `calls-log.md`, `ads-library.md`, `seo-library.md`
- **Stubs nuevos** (creados para que `reporting-performance` no degrade): `ads-log.md`, `sales-log.md`, `product-catalog.md`
- Refs: `references/references.md`
- Output dirs: `statics/`, `videos/`

**No aplican a WizTrip** (stub innecesario): `stock-log.md`, `logistics-log.md` — los agentes stock/logistics manejan ausencia con fallback a "Sin datos".

## Patrones de robustez (post mejoras de 2026-05)

Aplicados en TODOS los agentes después de la auditoría. Si agregás un agente nuevo, seguir estos patrones:

### 1. `writeVaultFile` con `mkdirSync` recursive
```js
function writeVaultFile(relativePath, content) {
  const filePath = resolve(VAULT, relativePath);
  mkdirSync(dirname(filePath), { recursive: true }); // crítico
  writeFileSync(filePath, content, "utf-8");
}
```
Sin esto, escribir a un cliente nuevo (sin scaffold previo) tira ENOENT silencioso y se pierde el output. Los agentes corregidos: `content-creator`, `content-strategy`, `social-media-metrics`, `seo`, `logistics`.

### 2. `callClaude` con retry + backoff exponencial
Para llamadas largas (brandbook ~16k tokens, code gen ~8k tokens) la API a veces tira 429/503 transient. El retry de 3 intentos con backoff (1s, 2s, 4s) recupera la mayoría:
```js
async function callClaude(prompt, maxTokens = 8192, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  // ... validate ANTHROPIC_API_KEY
  try {
    res = await fetch(...);
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      return callClaude(prompt, maxTokens, attempt + 1);
    }
    throw new Error(`Claude API network error tras ${MAX_ATTEMPTS} intentos: ${err.message}`);
  }
  // Retry para 429 y 5xx, no para 4xx
  if (!res.ok) {
    const isRetriable = res.status === 429 || res.status >= 500;
    if (isRetriable && attempt < MAX_ATTEMPTS) { /* backoff + retry */ }
  }
  // ...
}
```
Implementado en: `brandbook-processor`. Pendiente extender a otros agentes.

### 3. Validación post-Claude antes de escribir
Si Claude devuelve JSON parcial (truncado por `max_tokens`) o estructura inválida, fallar ruidoso ANTES de escribir archivos parciales al vault:
```js
// brandbook-processor — validar 8 secciones completas
const missing = SECTIONS.filter(s => !files[s.key]?.trim());
if (missing.length > 0) {
  throw new Error(`Claude omitió secciones: ${missing.map(s => s.key).join(", ")}`);
}

// content-creator — validar balance de tags JSX
validateJsxBalance(remotionCode); // cuenta <div>/<Sequence>/<AbsoluteFill> abiertos vs cerrados
```

### 4. Retry loop a nivel agente (Content Creator)
Cuando una validación falla, NO matar el agente — pedir a Claude que arregle el output específico:
```js
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const prompt = isRetry
    ? buildRetryPrompt(lastCode, lastError.message, compositionId) // pasa el error
    : buildOriginalPrompt(...);
  const code = await callClaude(prompt);
  try { validate(code); render(code); return; } 
  catch (err) { lastCode = code; lastError = err; if (attempt < MAX_ATTEMPTS) continue; throw err; }
}
```

### 5. Drain HTTP antes de `process.exit(1)`
Sin esto, `logAgentError()` y `updateAgentRun()` pueden quedar en flight cuando el proceso muere y se pierde el log:
```js
} catch (err) {
  await logAgentError(brief.client, AGENT, err).catch(() => {});
  await updateAgentRun(runId, { status: "error", summary: err.message }).catch(() => {});
  await new Promise(r => setTimeout(r, 800)); // drain
  process.exit(1);
}
```

### 6. Detección de placeholders sin reemplazar (client-bootstrap)
Si un template `{{TYPO_VAR}}` no tiene mapping en el brief, `applyVars` lo deja como string literal. Antes era invisible. Ahora reportamos:
```js
function findUnresolvedPlaceholders(content) {
  const matches = content.match(/\{\{[A-Z_][A-Z0-9_]*\}\}/g);
  return matches ? Array.from(new Set(matches)) : [];
}
// post-render: if unresolvedReport.length > 0, log warning + incluir en agent_output
```

## Tech stack

- **Runtime:** Node.js 22 (ES modules)
- **Scheduling:** GitHub Actions (no servers)
- **LLM:** Claude Sonnet 4.6 (model ID: `claude-sonnet-4-6`) — verificar SIEMPRE que está actualizado, no usar IDs viejos
- **Data layer:** Supabase (tablas: `agent_runs`, `agent_outputs`, `notifications`, `content_pieces`, `audit_log`, `client_requests`, `phase_reports`, etc.)
- **Dashboard:** Next.js 16 + React 19 + Vercel + Supabase Auth (NO es HTML estático — ver `dashboard/CLAUDE.md` para breaking changes)
- **Video:** Remotion 4.0 (en `remotion-studio/`)
- **Voice:** ElevenLabs
- **Images:** Google AI / Gemini
- **Publishing:** Blotato (opcional — solo si `brief.autoPublish=true`)

## Audit log + RLS

A partir de la migración 008 + 009, todas las acciones sensibles se registran automáticamente en `audit_log`:

- `team.invite/update/assign/unassign` — vía `/api/team/invite` o triggers SQL en `profiles` y `client_assignments`
- `client.create/delete/update` — vía `/api/clients/bootstrap` o trigger en `clients`
- `phase.generate/approve/request_changes` — vía endpoints en `/api/phases/`
- `request.update` — trigger en `client_requests` (también dispara `notifications` al cliente)
- `agent.dispatch` — `/api/agents/run`
- `kpis.update` — `/api/clients/[id]/kpis`

Solo el director puede leer `audit_log` (RLS). Vista en `/configuracion/audit`.

## Commands

```bash
# Correr agente local (requiere env vars + brief.json)
node scripts/morning-briefing/index.js --brief /tmp/brief.json
node scripts/content-creator/index.js --brief /tmp/brief.json
node scripts/reporting-performance/index.js --brief /tmp/brief.json

# Install deps
npm install

# Dashboard
cd dashboard && unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL && npm run dev
```

## Before you code — principios

1. **El vault es source of truth.** Agentes leen de `vault/` y escriben de vuelta. Nunca hardcodear data del cliente en scripts.
2. **Generic-first.** Cualquier feature nueva debe funcionar para CUALQUIER cliente. Cero defaults, cero fallbacks por slug. Si el brief no trae `client`, el agente falla ruidoso.
3. **Fail loudly, log everything.** Errores van a Supabase via `logAgentError()` + Telegram opcional. NO swallow errors silenciosos.
4. **Cada agente loggea a Supabase.** Usar `scripts/lib/supabase.js` → `logAgentRun` / `logAgentError` / `registerAgentOutput` / `pushNotification`.
5. **Model ID es siempre `claude-sonnet-4-6`.** Si ves IDs viejos (`claude-3-opus`, `claude-sonnet-3-5`), actualizar.
6. **Patrones de robustez arriba — aplicarlos siempre.** Especialmente `mkdirSync` recursive, retry en API calls, validación post-Claude.

## Environment variables

Never commit `.env` files. Secrets viven en GitHub Actions secrets para los agentes y en Vercel env vars para el dashboard. Para tests locales, `.env.local` (gitignored).

**Para agentes (GitHub Actions secrets):**
```
ANTHROPIC_API_KEY      # crítico
SUPABASE_URL           # crítico (logs)
SUPABASE_KEY           # crítico — es la service_role key (los agentes bypassean RLS)
ELEVENLABS_API_KEY     # solo content-creator si generateVoice
GOOGLE_AI_API_KEY      # solo content-creator si produceStatic
BLOTATO_API_KEY        # solo content-creator si autoPublish (opcional)
TELEGRAM_BOT_TOKEN     # opcional, notif de errores
TELEGRAM_CHAT_ID       # idem
GITHUB_TOKEN           # solo logistics (trigger stock vía dispatch)
GITHUB_REPO            # owner/repo, solo logistics
```

**Para dashboard (Vercel env vars):**
```
NEXT_PUBLIC_SUPABASE_URL              # pública
NEXT_PUBLIC_SUPABASE_ANON_KEY         # pública
SUPABASE_SERVICE_ROLE_KEY             # server-only — bypassa RLS
ANTHROPIC_API_KEY                     # consultor + phase reports
GH_DISPATCH_TOKEN                     # PAT con Actions:Read+Write para dispatch
GITHUB_OWNER                          # ej. giancostantini
GITHUB_REPO                           # ej. dc-scale-agents
CALENDLY_WEBHOOK_SECRET               # opcional, solo si Calendly Pro
```

Verificar estado de env vars del dashboard: `GET /api/diag/env` (devuelve presence + smoke tests).

## Conocido bloqueado / diferido

- **SMTP rate limit:** Supabase default permite 3 emails/h por proyecto. Bloquea testing de invitaciones repetidas. Solución: configurar SMTP propio (Resend / Postmark) — el handoff lo dejaba como "no urgente para MVP" pero al escalar es útil.
- **Google Calendar real:** solo flag `synced` en `cal_events`. Calendly webhook cubre el caso principal. Implementar OAuth GCal solo si hay requerimiento explícito.
- **Anthropic credits:** si el balance se va a cero, todos los agentes que llaman a Claude fallan con 400 "credit balance too low". Configurar auto-recarga en console.anthropic.com.
