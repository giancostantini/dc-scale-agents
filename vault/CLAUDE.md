# D&C Scale Partners — Contexto Maestro
Última actualización: 2026-08-11 (Stage 0 — reescrito desde la auditoría; la versión anterior
describía stack eliminado). Mapa completo: `docs/ai-company-audit/` en el repo.

## Quiénes somos
Agencia con dos verticales:
1. **Crecimiento digital y marketing** — paid media, contenido, SEO, conversión
2. **Automatización de procesos con IA** — agentes operando con guardrails

Gianluca Costantini (estrategia y arquitectura de agentes) + Federico (dashboards y frontend),
directores. Equipo: Lucía (CM / account lead), Octavio (editor de video).

## Estado del negocio
- Clientes activos: se cargan vía dashboard (tabla `clients`) — **ninguno hardcodeado en este repo**.
- Norte actual: roadmap v2 de la auditoría (Stages 0-6 + track Finanzas Autónoma) rumbo a los
  horizontes H2/H3 (coordinadores conversacionales por área → orquestador de compañía).
- Mercados objetivo: Uruguay + Latam (Colombia, Perú, Paraguay).

## Cómo trabajo yo (Gianluca)
- Prefiero avanzar hacia adelante, no retroceder
- Valido manualmente antes de automatizar; la autonomía se gana con métricas de aprobación
- Builds iterativos en sesiones de trabajo
- Corrijo directo cuando hay errores

## Stack activo (real — verificado en la auditoría 2026-08)
- Claude API (3 tiers: Opus reportes / **Sonnet 4.6** agentes y chats / Haiku fondo) — siempre vía
  las constantes de `anthropic-model.ts` / `scripts/lib/anthropic.js`
- Supabase: estado del negocio, memoria de agentes, logs y metering (RLS por rol)
- GitHub Actions: 7 crons activos + dispatch on-demand (registry en
  `dashboard/lib/agent-registry.ts` = fuente única de la flota)
- Vercel: dashboard (hub + portal cliente + finanzas + 4 consultores)
- Resend (mails) · Microsoft Graph (calendario Outlook) · Meta Marketing API (push de campañas)
- Obsidian: editor humano de este vault — el vault es markdown en git; los agentes lo leen por
  paths convencionales (no hay graph/links funcionales)

**Eliminado del stack** (no reintroducir sin decisión explícita): Remotion + content-creator
(la producción de video es humana; `creative-assistant` genera briefs), n8n, Google Sheets como
config, Blotato, Telegram como canal de errores (hoy: bell del dashboard + `cron-alert.yml`).

## Reglas de la vault
1. Siempre leer `claude-client.md` del cliente antes de generar contenido
2. Escribir aprendizajes en `learning-log.md` después de cada resultado (narrativa); las
   directivas/aprendizajes accionables van a `consultant_memory_v2` (las lee TODA la flota)
3. Actualizar `content-library.md` con métricas reales cuando llegan
4. Nunca hardcodear datos de clientes en scripts — generic-first
5. Si algo falla: `agent_runs` status error + notificación al bell (los crons avisan solos)
6. Datos crudos y estado van a Supabase; interpretación cualitativa va a la vault
7. Los outputs regenerables (ej. `sector-trends.md`) los commitean los workflows — no editarlos a mano

## Clientes y su contexto
- Cada cliente se crea vía dashboard → wizard → `client-bootstrap` scaffoldea
  `vault/clients/<slug>/` desde `vault/automation/templates/`
- Los agentes leen: `claude-client.md`, `strategy.md`, `brand/*` (8 archivos del
  brandbook-processor), logs (`learning-log`, `metrics-log`, …), `sector-trends.md`
- Nunca referenciar un cliente concreto desde este archivo

## Metodología Growth — 5 fases (Manual de la agencia)
1. **Diagnóstico** (5-7 días) — entendimiento del negocio, ROAS break-even (= 1/margen de
   contribución), mercado/competencia, análisis de anuncios (Hook→Problema→Mecanismo→Prueba→
   Oferta→Riesgo reverso→CTA), funnel/UX, benchmark → **Growth Diagnosis Report**
2. **Estrategia** (3-5 días) — canal principal/secundario/retención, ICP, propuesta de valor,
   funnel, plan de contenido, inversión, proyección + roadmap 90 días → **Growth Strategy Plan**
3. **Setup** (1-3 semanas) — contenido planificado, creativos, UGC/influencers, pixel/eventos,
   funnel, dashboards
4. **Lanzamiento** (2-4 semanas) — validar, no escalar: test 7-14 días, monitoreo CPC/CTR/CPA/
   CAC/ROAS, pausar perdedores, duplicar ganadores
5. **Optimización y escala** (continua) — campañas, creativos (anti-fatiga), funnel, escala
   progresiva → **reporte mensual de performance**

> El método completo está versionado en `vault/agency/methodology/` (Stage 1 ✔): una página
> por fase + SOPs (content-production, onboarding, reporting) + `checklists.md` (F1.4/3.5/4.4/
> 5.3). `/api/phases/generate` inyecta la página de la fase al prompt — **editar esos archivos
> cambia lo que citan los reportes**. Qué fuente manda en cada par vault↔DB:
> `vault/agency/data-ownership.md`.

## Visibilidad al cliente — qué del vault/clients/<id>/ ve el Consultor-Cliente

Hay dos consultores IA con acceso distinto al vault:

| | Consultor-Agencia (`/api/consultant`) | Consultor-Cliente (`/api/portal/consultant`) |
|---|---|---|
| Quién lo usa | director, team | role=client (portal del cliente) |
| Qué del vault lee | TODO via `loadClientVaultContext()` | Filtrado via `loadClientVaultForPortal()` |

**El Consultor-Cliente lee** (asumir que el cliente puede leerlo): `claude-client.md`,
`strategy.md`, `brand/*.md`, `content-library.md`, `content-calendar.md`, `ads-library.md`,
`seo-library.md`, `metrics-log.md`, `performance-log.md`, `sector-trends.md`.

**El Consultor-Cliente NUNCA lee** (info interna del equipo): `learning-log.md`, `calls-log.md`,
`_archive/*`, y las tablas `notes`, `consultant_memory*`, `audit_log`, `leads`,
`prospect_campaigns`, `expenses`.

**Convención al escribir en el vault:** lo crítico o sensible que el cliente NO debe ver va a
`learning-log.md` o `calls-log.md`. Cualquier otro archivo "público" puede llegar al
Consultor-Cliente y ser citado. Defensa en profundidad: no dependemos de que el modelo respete
instrucciones — directamente no le pasamos esos archivos (impl:
`dashboard/lib/portal-vault-context.ts`).

## Arquitectura — Principios no negociables
1. **Registry = verdad de la flota · Supabase = estado y registro · vault = conocimiento
   cualitativo** (cada cosa en su capa)
2. Claude Code construye, GitHub Actions ejecuta — no mezclar roles
3. Los agentes aprenden: chats + 👍/👎 → distill-learnings → `consultant_memory_v2` → prompts
4. Coordinación por DATOS y eventos, no por conversaciones agente→agente (única excepción con
   lista blanca: logistics→stock)
5. Generic-first — ningún agente con datos hardcodeados de un cliente
6. Fail loudly — error a `agent_runs` + bell; nunca swallow silencioso
7. Todo lo visible al cliente pasa por gate humano; el dinero es SIEMPRE humano
