# dc-scale-agents

AI agent system for D&C Scale Partners — growth marketing + automation agency.

## Quick context

- **Agency:** D&C Scale Partners (Gianluca + Federico, co-founders)
- **Active clients:** (se cargan vía dashboard — `dashboard/` + tabla `clients` de Supabase. Ningún cliente debe estar hardcodeado en este repo.)
- **Markets:** Uruguay + Latam (Colombia, Peru, Paraguay)
- **Verticals:** (1) Marketing growth (content, SEO, ads), (2) Automatizacion (agentes IA operando en autopilot)

## Read these BEFORE making any changes

1. [`vault/CLAUDE.md`](vault/CLAUDE.md) — **master agency context** (stack, principles, priorities)
2. [`vault/agents/`](vault/agents/) — specs of the 7 production agents (one folder per agent)
3. [`CONTRIBUTING.md`](CONTRIBUTING.md) — how we work together (branches, PRs, commits)
4. Contexto de cliente: `vault/clients/<client-slug>/claude-client.md` (se genera en el bootstrap desde `vault/automation/templates/`).

## Repo structure

| Folder | Purpose |
|--------|---------|
| `scripts/` | Agent logic (Node.js). Each folder = one agent. Entrypoint is `index.js`. |
| `scripts/lib/` | Shared utilities (Supabase client, etc.) |
| `vault/` | Obsidian vault — source of truth for all non-code context (specs, logs, client data) |
| `dashboard/` | Web dashboard (HTML + Supabase Auth, deployed to Vercel) |
| `remotion-studio/` | Code-based video production (used by Content Creator agent) |
| `.github/workflows/` | Scheduling for agents (replaces n8n) |

## Current production agents (7)

1. **Content Creator** — script → video → voice → image → publish pipeline
2. **Content Strategy** — weekly calendar generation (Mondays)
3. **Analytics** (Reporting Performance) — daily/weekly/monthly business reports + insights
4. **Morning Briefing** — daily Telegram briefing
5. **SEO** — keyword research + blog articles
6. **Social Media Metrics** — per-piece content performance evaluation (feedback loop)
7. **Stock + Logistics** — inventory + shipping (ecommerce with rotation)

Cada cliente vive en `vault/clients/<client-slug>/` con su propio `claude-client.md`, `content-library.md`, `learning-log.md`, etc. El estado de despliegue por cliente va en `vault/automation/deployments/<client-slug>/status.md`.

## Tech stack

- **Runtime:** Node.js 22 (ES modules)
- **Scheduling:** GitHub Actions (no servers)
- **Secrets:** GitHub Actions secrets (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ELEVENLABS_API_KEY, GOOGLE_AI_API_KEY, BLOTATO_API_KEY, GITHUB_REPO)
- **LLM:** Claude Sonnet 4.6 (model ID: `claude-sonnet-4-6`)
- **Data layer:** Supabase (tables: `agent_runs`, `content_pieces`) — see `vault/automation/supabase-schema.sql`
- **Dashboard:** Vercel + Supabase Auth
- **Video:** Remotion
- **Voice:** ElevenLabs
- **Images:** Google AI (Gemini)
- **Publishing:** Blotato

## Commands

```bash
# Run an agent locally (requires env vars set + a brief JSON)
# El client slug ya nunca se hardcodea — siempre viene del brief.
node scripts/morning-briefing/index.js --brief /tmp/brief.json
node scripts/content-creator/index.js --brief /tmp/brief.json
node scripts/reporting-performance/index.js --brief /tmp/brief.json

# Install deps
npm install

# Dashboard (local preview — open HTML with Live Server or any static server)
# No build step needed for current HTML version
```

## Before you code — principles

1. **The vault is the source of truth.** Agents read from `vault/` and write back to it. Never hardcode client data in scripts.
2. **Generic-first.** Any new feature must work for any client. Cero defaults de cliente, cero fallbacks. Si el brief no trae `client`, el agente falla ruidoso.
3. **Fail silently.** Errors notify via Telegram but don't break the pipeline for other clients.
4. **Every agent logs to Supabase.** Use `scripts/lib/supabase.js` → `logAgentRun` / `logAgentError`.
5. **Model ID is always `claude-sonnet-4-6`.** If you see an old ID, update it.

## Environment variables

Never commit `.env` files. Secrets live in GitHub Actions settings. For local testing, set them in your shell or use a local `.env.local` (gitignored).

Required for most agents:
```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```
