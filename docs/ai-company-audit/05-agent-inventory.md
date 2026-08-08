# 05 — Inventario de agentes (fichas + madurez)

> Escala de madurez: 0 placeholder · 1 prompt · 2 agente manual · 3 tool-enabled ·
> 4 workflow-integrated · 5 autónomo en producción con guardrails.
> Regla aplicada: *"agent-spec ≠ agente; archivo ≠ capacidad"* — el score exige trigger
> alcanzable verificado.

## Matriz resumen

| Agent | Área | Rol | Inputs | Outputs | Tools | Knowledge | Memory | Trigger | Llama a | Human gate | Madurez |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sector-trends | Market intel | Investigador de nicho | clients GP (Supabase) | vault `sector-trends.md` + `agent_outputs` + mail cliente | Claude+web_search, tool_use forzado | claude-client.md | — | **cron vie 12 UTC** | endpoint send-all (mails) | no (informativo) | **5** |
| distill-learnings | Plataforma/aprendizaje | Destilador de memoria | `content_ideas_messages`+rating | `consultant_memory_v2` kind=learning | Claude Haiku | memoria existente (dedup) | incremental por `agent_runs` | **cron dom 13 UTC** | — | no | **5** |
| insights-aggregator | Analytics | Agregador winners | `content_pieces.metrics` | `content_insights` | — (determinístico) | — | — | **cron lun 11 UTC** | — | no | **4** |
| stock-web | Stock (ecommerce) | Scraper de talles | web Fenicio del cliente | `agent_outputs` stock-snapshot + vault log | fetch/parse (sin Claude) | claude-client.md (`- Web:`) | — | **cron diario 11 UTC** | — | no | **5** |
| competitor-scanner | Market intel | Sync banco de anuncios | `competitors.md` curado a mano | `competitor_pieces` | — (parser, sin Claude) | competitors.md | — | **cron L/M/V 14 UTC** | — | insumo manual humano | **4** |
| morning-briefing | Ops interna | Resumidor diario | Supabase (runs, requests, KPIs) | `agent_outputs` + consultant_messages (modo user) | Claude Sonnet | vault cliente | — | fast-path + dispatch (cron pausado) | — | no | **4** |
| reporting-performance | Analytics | Analista KPIs | métricas Supabase + vault logs | reportes (`agent_outputs`) | Claude | metrics/performance-log | — | fast (query/insights) + GHA modos | — | no | **4** |
| creative-assistant | Contenido | Generador de briefs/piezas | chat del equipo + constraints | `content_posts` (draft) vía bulk-save | Claude + tool_use propose | brand 8 + strategy + insights + memoria cliente | `consultant_memory_v2` (lee) | endpoint UI + `run_agent` + GHA | — | **sí: aprobar batch → draft; aprobar → scheduled** | **4** |
| content-strategy | Contenido | Planificador calendario | brief (mes, objetivos) | calendario + briefs JSON (vault+DB) | Claude | brand + trends + learning-log | — | dispatch (cron pausado) | — | revisión humana del plan | **4** |
| seo | SEO | Generador SEO | brief | `seo-library.md` append + output | Claude | seo/* knowledge | — | dispatch | — | publicación manual | **3** |
| social-media-metrics | Analytics contenido | Evaluador per-pieza | métricas por pieza (hoy manuales) | learning-log append + hook-database | Claude | learning-log | escribe memoria cualitativa | dispatch (cron pausado) | — | no | **3** (sin fuente de métricas real) |
| stock | Stock | Analista inventario | stock-log.md | alertas/reportes | Claude | stock-log | — | dispatch + `repository_dispatch` desde logistics | logistics | no | **3** (N/A clientes actuales) |
| logistics | Logística | Analista despachos | logistics-log.md | reportes + trigger stock | Claude | logistics-log | — | dispatch (crons pausados) | → stock (repository_dispatch) | no | **3** (N/A) |
| brandbook-processor | Onboarding | Procesador de brandbook | PDF/texto del wizard | 8 archivos `brand/*` | Claude (16k) + retry + validación 8 secciones | brandbook crudo | — | dispatch desde wizard | — | wizard humano | **4** |
| client-bootstrap | Onboarding | Scaffolder | brief del wizard | árbol `clients/<slug>/` desde templates | — (sin Claude) | templates {{VARS}} | — | dispatch desde wizard | — | wizard humano | **4** |
| client-research | Market intel | Investigador del cliente | brief (cliente) | learning-log append | Claude + web_search | claude-client.md | — | dispatch | — | no | **3-4** |
| Consultor portal (D&C Advisor) | Client success | Interfaz IA del cliente | chat cliente + contexto filtrado | respuestas + persistencia | Claude Opus, sin tools | vault filtrado + 9 tablas | conversaciones + cross-history | UI portal | — | no ejecuta acciones (by design) | **4-5** |
| Consultor per-client (equipo) | Ops interna | Router operativo | chat equipo en /cliente | respuestas + dispatches | Claude + tools `run_agent`(8)/memoria | vault completo + memoria | `consultant_memory` | UI cliente/[id] | → 8 agentes | dispatch visible al equipo | **4** |
| Consultor global (widget) | Ops interna | Copiloto del equipo | chat + contexto multi-cliente | respuestas (streaming SSE) | tools `run_agent` + `save_memory` | vault + memoria user/cliente | `consultant_memory_v2` RW | UI hub | → agentes | — | **4** |
| Consultor de contenido | Contenido | Copy de placas p/ CM | chat + 👍/👎 | respuestas + `content_ideas_*` | Claude Sonnet + cache | vault completo + trends + memoria | hilo persistente + rating | UI contenido | — | — | **4** |
| ~~content-creator~~ | Contenido | Productor de video (Remotion) | — | — | — | — | — | **ELIMINADO de main** (junto a remotion-studio) | — | — | — |
| prospecting | Ventas | — | — | — | — | — | — | **No existe** (spec de 2 líneas) | — | — | **0** |

## Fichas (campos no cubiertos por la matriz)

Comunes verificados a casi todos los scripts: error handling con retry/backoff en llamadas a
Claude (`scripts/lib/anthropic.js`, 3 intentos), drain de 800ms antes de `process.exit(1)`,
`mkdirSync recursive` al escribir vault, logging a `agent_runs`/`agent_outputs`/`notifications`
y metering a `api_usage` (source `agent:<slug>`). **Tests: 0 en todo el repo** (no existe carpeta
de tests ni framework configurado). Observabilidad = agent_runs + feed en `/hub/agentes` +
notificaciones + panel de costos; sin alerting externo (Telegram vestigial).

### sector-trends — KEEP (el pipeline más maduro)
Propósito: tendencias semanales del nicho por cliente GP; alimenta 3 superficies (interno
`/tendencias`, equipo, portal+mail) y retroalimenta a los agentes de contenido
(`buildSectorTrendsBlock`). No-responsabilidad: no decide contenido. 2 llamadas Claude
(web_search + estructurado con tool_use forzado — guardrail anti-alucinación). Problema: ninguno
grave; es el patrón a replicar. Overlap: leve con client-research (investigación puntual vs
periódica) — aceptable.

### distill-learnings — KEEP (motor del loop de aprendizaje)
Destila ≤5 aprendizajes/semana desde chats+ratings hacia la memoria que TODA la flota ya lee
(`scripts/lib/client-memory.js`). Guardrails: incremental, dedup contra memoria existente,
Haiku barato, cap. Riesgo vigilable: calidad de lo destilado (sin eval formal aún).

### insights-aggregator / stock-web / competitor-scanner — KEEP, reclasificar
**No son "agentes"** en la taxonomía (no razonan): son **jobs determinísticos** (ETL/scraper/
parser). Recomendación: llamarlos jobs en el registry para no inflar el "conteo de agentes".
stock-web además escribe `stock-web-log.md` y depende del formato del HTML de Fenicio (frágil
ante rediseños; sin test de contrato).

### morning-briefing / reporting-performance — KEEP
Los dos únicos con fast-path in-process (`FAST_AGENTS`). Sus crons diarios fueron pausados por
costo (jul 2026) — hoy son on-demand, correcto. reporting tiene modos (query/insights baratos
fast; daily/weekly/monthly por GHA).

### creative-assistant + content-strategy — KEEP (núcleo de contenido)
creative-assistant es el reemplazo efectivo de content-creator: produce briefs/piezas que
humanos aprueban (batch → draft → scheduled → published) y soporta `generateAiPrompt` para
herramientas externas de imagen/video. content-strategy genera el calendario. Ambos leen brand
+ trends + memoria → son los mayores beneficiarios del loop de aprendizaje.

### seo / social-media-metrics / stock / logistics — KEEP con reservas
Operativos vía dispatch pero sin uso real hoy: seo publica a un archivo que nadie consume aguas
abajo; social-media-metrics no tiene fuente de métricas automatizada (gap de ingestion — las
métricas de `content_pieces.metrics` se cargan a mano); stock/logistics no aplican a los
clientes actuales (WizTrip agencia, Glassy sin logs cargados). No borrar: son el catálogo de la
vertical automatización. Marcar "dormidos" en el registry.

### brandbook-processor / client-bootstrap / client-research — KEEP
Pipeline de onboarding sólido (retry + validación de 8 secciones; detección de placeholders sin
resolver en bootstrap). client-research usa web_search para poblar learning-log al arrancar.

### Los 4 consultores — KEEP, unificar patrón
Cuatro endpoints con el mismo esqueleto (contexto → system blocks cacheados → Claude →
persistencia) pero implementados 4 veces con variaciones (portal sin tools; per-client con
run_agent de 8; global con run_agent+save_memory y streaming; contenido con rating). Overlap
real per-client vs global (ambos para el equipo, distinto scope). Recomendación: extraer un
motor común de "consultor" (contexto+tools+persistencia) y declarar los 4 como configuraciones.
Además: consultor per-client usa la tabla legacy `consultant_memory` mientras global usa `_v2`
— unificar en v2.

### content-creator — DEPRECATE (ya ejecutado, falta limpiar rastros)
El agente y remotion-studio ya no están en main, pero quedan: spec + hook-database +
prompt-library + winning-formats en `vault/agents/content-creator/`, referencias en
`CLAUDE.md`/`vault/CLAUDE.md` (como prioridad #1) y en specs de otros agentes. Acción: archivar
specs y actualizar la doc maestra.

### prospecting — NOT ACTUALLY AN AGENT
Solo un stub de 2 líneas + carpeta `vault/prospecting/` con templates de outreach/scoring
(también stubs). El CRM real es el módulo pipeline/leads del dashboard (manual). Si ventas es
prioridad, esto es un GAP de build, no un agente existente.

## Diagrama 3 — Relaciones actuales entre agentes

```mermaid
flowchart LR
  subgraph Consultores
    CG[Consultor global]
    CPC[Consultor per-client]
  end
  CG -- run_agent --> FA["/api/agents/run"]
  CPC -- run_agent --> FA
  FA -- fast in-process --> MB[morning-briefing]
  FA -- fast --> RP[reporting-performance q/i]
  FA -- repository_dispatch --> GHA[GHA: creative-assistant, content-strategy,<br/>seo, social-metrics, stock, logistics, research...]
  LOG[logistics] -- repository_dispatch --> STK[stock]
  ST[sector-trends] -. escribe sector-trends.md .-> CS[content-strategy]
  ST -. idem .-> CA[creative-assistant]
  DL[distill-learnings] -. escribe consultant_memory_v2 .-> CA & CS & Consultores
  IA[insights-aggregator] -. content_insights .-> CPC
  CSC[competitor-scanner] -. competitor_pieces .-> CPC
  SMM[social-media-metrics] -. hook-database/learning-log .-> CS
```

Única cadena agente→agente directa: **logistics → stock** (repository_dispatch). El resto se
coordina por DATOS compartidos (vault + tablas), no por llamadas — un acoplamiento sano que
evita loops. No existe hoy ningún ciclo posible (verificado: nadie dispara a quien lo dispara).
