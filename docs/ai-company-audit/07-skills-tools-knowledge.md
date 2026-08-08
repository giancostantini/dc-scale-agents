# 07 — Skills, tools y knowledge (aplicando la taxonomía)

## A. Skills reales (capacidades reutilizables verificadas en código)

| Skill | Implementación | Reusada por |
|---|---|---|
| Cargar contexto de cliente (vault) | `scripts/lib/brand-loader.js` + `dashboard/lib/vault-loader.ts` | todos los agentes de contenido + consultores |
| Bloque de tendencias | `scripts/lib/sector-trends-context.js` (`buildSectorTrendsBlock`) | content-strategy, creative-assistant |
| Memoria de cliente | `scripts/lib/client-memory.js` (`fetchClientMemory`/`buildClientMemoryBlock`) | agentes operativos + consultores |
| Llamada Claude con retry+cache+metering | `scripts/lib/anthropic.js` (`callClaude`) | agentes scripts |
| Logging operativo | `scripts/lib/supabase.js` (logAgentRun/registerAgentOutput/pushNotification/recordApiUsage) | todos |
| Contexto Supabase del cliente | `dashboard/lib/consultant-context.ts` (9 tablas → bloque) | consultores + welcome |
| Envelope crypto de credenciales | `dashboard/lib/vault-crypto.ts` (sealSecret/openSecret, RSA-OAEP+AES-GCM) | bóvedas cliente/agencia |
| Auth guards | `dashboard/lib/auth-guard.ts` (requireRole/requireClientAccess/safeEqual) | 87 endpoints |
| Emails transaccionales | `dashboard/lib/email.ts` (12 templates: request/phase/trends/task/payment/portal-access/digest…) | flujos de negocio |
| Costeo de tokens | `dashboard/lib/claude-pricing.ts` + `api_usage` | panel Costos |

**No existe skill registry formal** — las "skills" son libs compartidas; suficiente al tamaño
actual, pero invisible para razonar qué puede hacer el sistema (el brief de cada agente es la
única interfaz declarada, `scripts/*/brief-schema` parcial).

## B. Tools externas: declaradas vs realmente integradas

| Tool | En el sistema | Estado real |
|---|---|---|
| Anthropic Claude | scripts + 13 call sites dashboard, 3 tiers (Opus/Sonnet/Haiku) | **ACTIVO** (core) |
| Supabase | datos+auth+storage+RLS | **ACTIVO** (core) |
| GitHub (Actions + Contents API + dispatch) | ejecución + lectura/escritura vault + PRs | **ACTIVO** (core) |
| Resend | `lib/email.ts` | **ACTIVO** |
| Microsoft Graph (Outlook) | OAuth + webhook + renew diario | **ACTIVO** |
| Meta Marketing API | `meta-token` por cliente + `generate-campaign-spec` + `push-campaign` | **ACTIVO parcial** (push sí; lectura de insights NO) |
| Fenicio (tiendas) | scraping determinístico stock-web | **ACTIVO** (frágil, sin API) |
| Looker Studio | links por cliente (columna + external_links) | **ACTIVO** (externo, sin API) |
| ElevenLabs / Google AI (Gemini/NanoBanana) | referenciados en env/CLAUDE.md; su consumidor (content-creator) fue eliminado | **HUÉRFANOS** a re-evaluar |
| Telegram | token en workflows; uso solo vestigial en `scripts/lib/supabase.js` | **VESTIGIAL** |
| Blotato (publicación redes) | solo un comentario en `agents/run` | **NO IMPLEMENTADO** |
| Calendly | webhook secret previsto | Opcional |
| Google Sheets / n8n | citados en `vault/CLAUDE.md` como stack | **NO están en el código** (doc stale) |
| Stack del Manual (Foreplay, SimilarWeb, Clarity, Hotjar, GA4, Dashcortex, Higgsfield, Runway, Canva, ForkAds, UGC Point, Pooshlo) | checklist manual en `lib/integrations-defaults.ts` (status disconnected) | **HERRAMIENTAS HUMANAS** — el sistema solo trackea su estado a mano |

Lectura clave: **el Manual opera con un stack humano que el sistema no toca**; el sistema
construyó un stack IA paralelo. El punto de contacto real entre ambos mundos hoy: Meta API
(push) y los archivos que los humanos curan (competitors.md, métricas manuales).

## C. Knowledge: qué existe y qué se usa

| Knowledge | Dónde | ¿Consumido? |
|---|---|---|
| Brand por cliente (8 archivos) | `vault/clients/<slug>/brand/` | ✔ prompts de contenido + consultores |
| Estrategia/overview del cliente | `strategy.md`, `claude-client.md` | ✔ |
| Aprendizajes cualitativos | `learning-log.md` (10 refs) + `consultant_memory_v2` | ✔ (doble sistema: archivo + tabla) |
| Tendencias | `sector-trends.md` + `agent_outputs` | ✔ (dual write, ambos leídos) |
| Winners/hooks | `hook-database.md` ×2 ubicaciones + `winning-formats.md` + `content_insights` | ◐ leídos pero casi vacíos (falta el loop de métricas) |
| Manual Growth (5 fases) | **PDF externo — NO versionado** (stubs en `vault/agency/`) | ✘ ningún agente lo conoce |
| SOPs de agencia | stubs 2 líneas | ✘ |
| Prompts | inline en cada script/endpoint; `prompt-library.md` aparte | prompts reales = código; los .md casi no se usan |

## D. Confusiones taxonómicas detectadas (pedidas por el brief)

1. `hook-database.md` no es un agente ni una DB: es un archivo semilla duplicado en 2 niveles
   (agente y cliente) — consolidar en uno.
2. `agent-spec.md` ≠ agente operativo: prospecting es spec-sin-código; content-creator es
   spec-sin-agente (quedó huérfano tras el borrado).
3. Jobs determinísticos etiquetados como "agentes" (insights-aggregator, stock-web,
   competitor-scanner, client-bootstrap): son scripts/ETL — valiosos, pero inflan el conteo de
   "agentes IA".
4. Los prompts de producción viven en código mientras existe una "prompt-library" en vault que
   sugiere lo contrario.
5. Memoria en 3 lugares con solapamiento: `learning-log.md` (cualitativo por cliente),
   `consultant_memory` (legacy) y `consultant_memory_v2` (actual) — v2 es la única con
   lectura fleet-wide.
