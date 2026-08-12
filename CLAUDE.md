# dc-scale-agents

Sistema de agentes IA de **D&C Scale Partners** (agencia de growth marketing + automatización).
Este archivo se reescribió en el Stage 0 del roadmap (2026-08-11) para reflejar el sistema REAL —
la versión anterior describía piezas eliminadas. Fuente de verdad extendida:
[`docs/ai-company-audit/`](docs/ai-company-audit/AI-COMPANY-AUDIT.md).

## Quick context

- **Agencia:** D&C Scale Partners (Gianluca + Federico, directores; Lucía CM/account; Octavio editor).
- **Clientes:** se cargan vía dashboard (tabla `clients`). **Nunca hardcodear clientes en scripts** —
  todo agente recibe el cliente por brief y falla ruidoso si falta.
- **Mercados:** Uruguay + Latam. **Verticales:** growth marketing + automatización con IA.

## Leer ANTES de tocar código

1. [`docs/ai-company-audit/`](docs/ai-company-audit/) — auditoría completa: mapa real del sistema,
   arquitectura target (híbrida), roadmap Stages 0-6 + track Finanzas, horizontes H1→H3.
2. [`dashboard/lib/agent-registry.ts`](dashboard/lib/agent-registry.ts) — **fuente única de la
   flota**. El catálogo UI, la lista de dispatch del consultor y la validación de `/api/agents/run`
   DERIVAN de acá. Alta/baja de agente = editar el registry (+ workflow si corre por GHA).
3. [`vault/CLAUDE.md`](vault/CLAUDE.md) — contexto maestro de agencia y reglas del vault.
4. [`CONTRIBUTING.md`](CONTRIBUTING.md) — branching, PRs, commits.
5. [`dashboard/CLAUDE.md`](dashboard/CLAUDE.md) — Next.js 16: NO es el Next que conocés.

## Estructura del monorepo

| Carpeta | Qué es |
|---|---|
| `dashboard/` | Producto central (Next.js 16 + React 19 + Supabase + Vercel): hub interno, portal del cliente, finanzas, 4 consultores IA, 87 API routes |
| `scripts/` | Flota de agentes/jobs (Node 22, ES modules). Entrypoint `index.js --brief /path/brief.json`. `scripts/lib/` = utilities compartidas (supabase, anthropic con retry+cache, brand-loader, client-memory, sector-trends-context) |
| `vault/` | Markdown en git: contexto por cliente (`clients/<slug>/` — LO CRÍTICO), templates de scaffold, knowledge de agentes, capa de agencia (en construcción — Stage 1) |
| `.github/workflows/` | Ejecución: 7 crons activos + dispatch on-demand. `cron-alert.yml` avisa al bell si un cron falla |
| `landing/`, `kickoff/` | Páginas estáticas deployadas (sitio agencia / kickoff) |

**Ya NO existen** (eliminados; no confiar en docs viejas que los mencionen): `remotion-studio/`,
`scripts/content-creator/` (la producción de video volvió a humanos; `creative-assistant` genera
los briefs), n8n, Google Sheets como config, Blotato, Telegram como canal (vestigial).

## La flota (resumen — el detalle vive en el registry)

- **Crons activos (16):** sector-trends (vie), distill-learnings (dom), insights-aggregator (lun),
  competitor-scanner (L/M/V), stock-web (diario), outlook-renew (diario), portal-weekly-digest (lun),
  fx-rates (diario, FIN-0), billing/facturación+cobranzas (diario, FIN-1), monthly-close (día 2,
  FIN-3), meta-insights + organic-insights (diarios, Stage 2 — dormidos sin token), process-sync
  (diario, Stage 3), monthly-reports (día 3, Stage 3), events-dispatch (diario, Stage 5 — sweeper
  del outbox), autonomy-review + budget-recommendations (lun, Stage 6), evals (lun, Stage 2c —
  juez de sets dorados vs `vault/agency/evals/`). Event-driven:
  phase-autogen (al aprobar una fase, drafea la siguiente) + outbox `events` (triggers SQL →
  /api/events/dispatch). Autonomía: `autonomy_settings` — todo gated por default; promover =
  UPDATE de un director. `cron-alert.yml` vigila a todos.
- **On-demand** (dispatch del dashboard / tool `run_agent` de consultores): creative-assistant,
  content-strategy, seo, reporting-performance, morning-briefing, social-media-metrics, stock,
  logistics, client-research, brandbook-processor, client-bootstrap.
- **Fast-path in-process en Vercel:** morning-briefing, reporting-performance (modos query/insights).
- **Consultores (4):** portal del cliente (sin tools), per-client equipo (run_agent), global equipo
  (run_agent + save_memory, streaming), consultor de contenido (👍/👎 → aprendizaje).
- **Loop de aprendizaje:** chats + ratings → `distill-learnings` (Haiku, semanal) →
  `consultant_memory_v2` → la leen todos los agentes vía `scripts/lib/client-memory.js`.

## Cómo se ejecuta trabajo

1. **Cron GHA** → script lee vault por filesystem, escribe Supabase por REST, commitea vault.
2. **Dispatch** → `/api/agents/run` (valida contra el registry): fast-path in-process o
   `repository_dispatch` a GHA.
3. **Endpoints IA directos** → consultores, phases/generate, creative-assistant (13+ call sites,
   todos con `recordApiUsage` → panel Finanzas → Costos API).

## Human gates (no romperlos jamás)

Fases: draft IA → director aprueba → mail al cliente. Contenido: batch IA → draft → aprobar →
scheduled → published (publicación manual). Campañas Meta: spec IA → humano pushea
(`/api/meta/push-campaign`). Solicitudes: director asigna/responde. **Dinero: siempre humano**
(finanzas sin IA ejecutora; el área Finanzas Autónoma — doc 16 — prepara/alerta/draftea, no ejecuta).

## Patrones de robustez (obligatorios en agentes nuevos)

1. `writeVaultFile` con `mkdirSync recursive` (sin esto, ENOENT silencioso en clientes nuevos).
2. `callClaude` de `scripts/lib/anthropic.js`: retry 3× con backoff para 429/5xx + prompt caching
   (`system` = prefijo estable) + `recordApiUsage` (source `agent:<slug>`).
3. Validación post-Claude ANTES de escribir (secciones completas, JSX balanceado, tool_use forzado
   para outputs estructurados).
4. Retry a nivel agente cuando la validación falla (pasarle el error a Claude, no matar el run).
5. Drain de 800ms antes de `process.exit(1)` (que los logs lleguen a Supabase).
6. Detección de placeholders `{{VAR}}` sin resolver.
7. Loop por cliente con `|| warning` (un cliente que falla no corta el resto).

## Tech stack (real, verificado 2026-08)

- **Runtime agentes:** Node 22 ESM · **Scheduling:** GitHub Actions (crons semanales + dispatch;
  minutos = plan Pro, cuidar matrix/diarios) · **Dashboard:** Next.js 16 + React 19 + Vercel.
- **LLM:** Anthropic — 3 tiers en `dashboard/lib/anthropic-model.ts` y `scripts/lib/anthropic.js`:
  `CLAUDE_MODEL_OPUS` (reportes pesados), `CLAUDE_MODEL_SONNET` (chats/agentes; **default
  claude-sonnet-4-6**), `CLAUDE_MODEL_HAIKU` (fondo barato). Siempre vía esas constantes, nunca IDs
  sueltos. Todo call site registra `api_usage`.
- **Datos:** Supabase (Postgres+Auth+Storage+RLS). ~50 tablas. Migraciones en
  `dashboard/supabase/migrations/` (se aplican A MANO en el SQL editor — ojo: hay DDL histórico
  también en `vault/automation/supabase-schema*.sql`; consolidación pendiente, gap #6).
- **Integraciones activas:** Resend (mails), Microsoft Graph (Outlook calendar), Meta Marketing API
  (push de campañas; lectura de Insights = gap #3 pendiente), GitHub API (vault desde Vercel),
  Fenicio (scraping stock-web), Looker Studio (links).

## Env vars

Agentes (GitHub Secrets): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` (service-role),
`DASHBOARD_URL`+`DIGEST_CRON_SECRET` (mails), `GITHUB_TOKEN`/`GITHUB_REPO` (logistics→stock).
Dashboard (Vercel): `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL*` (overrides), `GH_DISPATCH_TOKEN`+`GITHUB_OWNER/REPO`,
`CRON_SECRET`, `META_ACCESS_TOKEN` (push campañas), `RESEND_API_KEY`, Microsoft Graph vars.
Diagnóstico: `GET /api/diag/env`. **Nunca commitear .env.**

## Comandos

```bash
# Agente local (env vars + brief.json)
node scripts/morning-briefing/index.js --brief /tmp/brief.json

# Dashboard
cd dashboard && npm run dev
cd dashboard && npm run build   # SIEMPRE antes de commitear cambios del dashboard
```

## Principios

1. **Generic-first**: todo funciona para cualquier cliente; sin defaults por slug; brief sin
   cliente = fallo ruidoso.
2. **El registry es la verdad de la flota**; el vault es la verdad del conocimiento cualitativo;
   Supabase es la verdad del estado y el registro.
3. **Fail loudly**: errores a `agent_runs` + notificación; crons fallidos avisan solos
   (`cron-alert.yml`).
4. **Least autonomous component**: función > script > workflow > agente. No crear agentes que un
   job resuelve.
5. **Todo lo visible al cliente pasa por gate humano** hasta ganarse lo contrario con métricas
   (ver `docs/ai-company-audit/12` y `17`).
6. **Costos medidos**: cada llamada a Claude registra tokens; el panel de Costos es la referencia.
