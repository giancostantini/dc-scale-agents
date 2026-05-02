# Dashboard · Dearmas Costantini Scale

Sistema interno de gestión de la agencia (clientes, equipo, fases, finanzas, agentes IA).

- **Producción:** https://sistemadearmascostantini.com
- **Stack:** Next.js 16 (Turbopack) · React 19 · Supabase · Anthropic SDK · Vercel

## Getting Started

### 1 · Variables de entorno

```bash
cp .env.example .env.local
# completar valores — ver .env.example para origen de cada var
```

Las críticas:
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypassea RLS
- `GH_DISPATCH_TOKEN` + `GITHUB_OWNER` + `GITHUB_REPO` — para que el dashboard dispare agentes IA via GitHub Actions
- `ANTHROPIC_API_KEY` — para consultor IA y phase reports

### 2 · Migraciones Supabase

SQL Editor → correr una a una (idempotentes):

```
supabase/migrations/
  001_expand_prospect_campaigns.sql
  002_client_onboarding.sql
  003_director_role.sql
  004_team_management.sql
  005_storage_bucket.sql
  006_client_assets_bucket.sql
  006_phase_reports.sql
  007_three_roles.sql
  008_audit_log.sql            # cuando exista
```

Verificación:
```sql
SELECT auth_role(), auth_client_id(), auth_pipeline_access();
```

### 3 · Buckets de Storage

En Supabase Storage UI crear (Public: OFF):
- `client-onboarding` — kickoff PDFs, branding subido en el wizard
- `client-assets` — asset library del brandbook

### 4 · Dev server

```bash
unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL  # solo si Claude Code está corriendo en el shell
npm install
npm run dev
```

Abrir http://localhost:3000.

## Deploy a Vercel

1. Conectar el repo en Vercel y apuntar el root al directorio `dashboard/`.
2. Setear todas las env vars de `.env.example` en Settings → Environment Variables (Production + Preview + Development).
3. Redeploy después de cada cambio de env var.

### Verificar que las env vars están cargadas

```
GET https://<tu-deploy>.vercel.app/api/diag/env
```

Devuelve un JSON con cada var enmascarada — si una crítica está faltando, lo vas a ver.

## Desarrollo

- Lint: `npm run lint`
- Type-check: `npx tsc --noEmit`
- Build prod local: `npm run build`

## Estructura

```
app/                 — Next.js App Router (rutas, API routes, layouts)
  hub/               — landing post-login (lista de clientes)
  cliente/[id]/      — vistas de cliente (planificador, fábrica, fases, etc.)
  portal/            — portal del cliente (read-only KPIs, solicitudes, consultor)
  api/               — endpoints (team/invite, phases/*, agents/run, etc.)
components/          — UI compartida
lib/                 — helpers (storage, supabase clients, github-dispatch, etc.)
supabase/migrations/ — migraciones SQL versionadas
```

## Notas importantes

- **Next.js 16 tiene breaking changes** vs versiones previas. Antes de tocar APIs/conventions ver `node_modules/next/dist/docs/`.
- **`SUPABASE_SERVICE_ROLE_KEY` es server-only** — nunca con prefijo `NEXT_PUBLIC_`. Exponerla al cliente compromete toda la base.
- **Los agentes IA corren en GitHub Actions**, no en Vercel — el dashboard solo dispara `repository_dispatch`. Ver `lib/github-dispatch.ts` y `.github/workflows/`.
