# 02 — Mapa del sistema actual

> Auditoría AI Company OS · 2026-08-07 · evidencia sobre `main` @ `ceb0aa0`.
> Dimensiones: 20 workflows GHA · 17 módulos en `scripts/` · dashboard Next.js 16 con 87 API
> routes y 55 páginas · 87 migraciones + `schema.sql` + 2 SQL en vault (≈49 tablas) · vault
> Obsidian con 117 `.md` · 25 págs de Manual Growth (PDF externo, entregado en esta auditoría).

## Diagrama 1 — Arquitectura actual

```mermaid
flowchart TB
  subgraph HUMANOS
    DIR[Directores Gian+Fede]
    TEAM[Equipo: CM Lucia, Editor Octavio]
    CLI[Cliente WizTrip / Glassy]
  end

  subgraph VERCEL["Dashboard (Next.js 16 en Vercel)"]
    HUB[Hub interno + cliente/*]
    PORTAL[Portal del cliente]
    FIN[Finanzas]
    CONS["4 Consultores IA<br/>(portal · global · per-client · contenido)"]
    FASTPATH["/api/agents/run<br/>fast-path in-process"]
    METAAPI["/api/meta/push-campaign"]
  end

  subgraph GHA["GitHub Actions (20 workflows)"]
    CRON["7 crons activos:<br/>sector-trends vie · distill dom ·<br/>insights lun · competitor LMV ·<br/>stock-web diario · outlook diario ·<br/>digest lun"]
    DISP["repository_dispatch<br/>(brandbook, bootstrap, research,<br/>creative-assistant, seo, etc.)"]
  end

  subgraph DATA["Supabase (Postgres + Auth + Storage)"]
    SOR["System of record:<br/>clients, profiles, content_posts,<br/>client_requests, phase_reports, finanzas"]
    OPS["Operación agentes:<br/>agent_runs, agent_outputs, api_usage"]
    MEM["Memoria/aprendizaje:<br/>consultant_memory_v2, content_insights,<br/>content_ideas_* + rating"]
    VAULTCRED["Bóvedas cifradas:<br/>vault_meta, client_credentials,<br/>agency_credentials"]
  end

  subgraph REPO["Repo git (vault/ = 117 .md)"]
    VCLI["clients/wiztrip/*<br/>brand 8 archivos + logs"]
    VKNOW["agents/* knowledge<br/>(hook-db, winning-formats)"]
    VTPL["automation/templates<br/>(scaffold {{VARS}})"]
    VSTUB["agency/* = STUBS VACIOS"]
  end

  EXT["Externos: Anthropic · Resend · Microsoft Graph ·<br/>Meta Marketing API · GitHub API · ElevenLabs/Gemini (refs) ·<br/>Looker (links) · Fenicio (scraping)"]

  DIR & TEAM --> HUB
  CLI --> PORTAL
  HUB -->|dispatch| FASTPATH
  FASTPATH -->|whitelist 3| DATA
  FASTPATH -->|repository_dispatch| DISP
  CONS -->|run_agent tool| FASTPATH
  CRON & DISP -->|leen/escriben fs| REPO
  CRON & DISP -->|REST service-role| DATA
  VERCEL -->|GitHub Contents API<br/>lee vault + escribe brand| REPO
  VERCEL --> DATA
  DISP -->|commit+push| REPO
  VERCEL & GHA --> EXT
```

## Cómo se ejecuta trabajo hoy (3 vías verificadas)

| Vía | Mecánica | Quién la usa | Evidencia |
|---|---|---|---|
| **Cron GHA** | 7 schedules activos; leen vault por filesystem, escriben Supabase por REST, commitean vault | sector-trends, distill-learnings, insights-aggregator, competitor-scanner, stock-web, outlook-renew, weekly-digest | `.github/workflows/*` (mapa completo en doc 06) |
| **Dispatch on-demand** | UI/consultor → `/api/agents/run`: whitelist FAST corre in-process en Vercel (morning-briefing, reporting query/insights); el resto va por `repository_dispatch` a GHA | Botones del dashboard + tool `run_agent` de los consultores | `dashboard/app/api/agents/run/route.ts:43-83` |
| **Endpoints IA directos** | Rutas del dashboard que llaman a Anthropic en el request (consultores, phases/generate, creative-assistant, brandbook wizard…) | Chat del portal/equipo, generación de fases, briefs | 13+ call sites con `recordApiUsage` |

## Componentes del monorepo

| Pieza | Qué es | Estado |
|---|---|---|
| `dashboard/` | Producto central: hub interno + portal cliente + finanzas + consultores | **Producción** (Vercel) |
| `scripts/` | 15 agentes/jobs + `lib/` compartida + 2 utilidades admin (`admin-set-password.mjs`, `admin-remove-mfa.mjs`) | Producción (via GHA/fast-path) |
| `vault/` | Markdown: contexto por cliente + knowledge de agentes + templates + stubs de agencia | Mixto (ver doc 03) |
| `landing/` | Landing pública de la agencia (HTML estático + `vercel.json`) | Deploy propio |
| `kickoff/` | Página HTML de kickoff (estática) | Deploy propio |
| `remotion-studio/` | **NO EXISTE en main** (removido junto con el agente content-creator) | Eliminado |

## Hechos de arquitectura (verificados)

1. **El dashboard no lee el vault por filesystem**: usa GitHub Contents API con cache 5 min
   (`dashboard/lib/vault-loader.ts`) y escribe brand/ vía PUT (`lib/vault-writer.ts`). Los
   agentes GHA sí leen/escriben filesystem y commitean.
2. **DDL fragmentado en 3 fuentes**: `dashboard/supabase/schema.sql` (14 tablas base),
   87 migraciones (35 tablas más), y `vault/automation/supabase-schema*.sql` (agent_runs,
   content_pieces, content_insights, competitor_pieces, consultant_memory legacy). Tablas como
   `agent_outputs`/`notifications` no tienen CREATE TABLE versionado localizable en una sola
   fuente → riesgo de drift entre repo y base real.
3. **4 registries de agentes implícitos y desalineados**: catálogo UI (7 en `lib/agents.ts`),
   `DISPATCHABLE_AGENTS` del consultor (8, `app/api/consultant/route.ts:32`), `FAST_AGENTS`
   (3 claves, `app/api/agents/run/route.ts:43`), y los 20 workflows. Ninguno es fuente única.
4. **Sin RAG/embeddings/semantic search**: cero hits de `embedding|pgvector|vector` en código
   de app. El contexto llega por carga completa de archivos por path convencional + builders
   con truncado (`buildVaultBlock` 16k chars, `buildSectorTrendsBlock` 3.5k, etc.).
5. **Doc maestra desactualizada**: `CLAUDE.md` y `vault/CLAUDE.md` aún describen
   content-creator/Remotion como prioridad #1, n8n reemplazado, Google Sheets, Blotato y
   Telegram como stack activo — nada de eso está operativo en main (content-creator y
   remotion-studio eliminados; Telegram solo vestigial en `scripts/lib/supabase.js`; Blotato
   solo aparece en un comentario de `agents/run`).
