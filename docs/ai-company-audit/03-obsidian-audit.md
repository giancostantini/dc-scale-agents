# 03 — Auditoría de Obsidian / vault

> Evidencia dura tomada de `main` @ `ceb0aa0`: **117 archivos .md · 0 wikilinks `[[...]]` ·
> 0 frontmatter YAML** (verificado por grep sobre todos los archivos).

## Veredicto

**Clasificación global: D — parcialmente integrado.** El "vault" NO funciona como un vault de
Obsidian (sin links, sin metadata, sin graph funcional): funciona como **file store de Markdown
en git, con paths convencionales hardcodeados en código**. Obsidian-la-app es solo un editor
cómodo; podría desinstalarse hoy sin que nada cambie. Los ARCHIVOS, en cambio, tienen capas de
valor muy distinto:

| Capa | Contenido | ¿Quién la usa? | Clase |
|---|---|---|---|
| `clients/<slug>/` (brand 8 + logs + estrategia) | Contexto operativo real de WizTrip/Glassy | **10 scripts** (108 refs) + dashboard vía GitHub API → entra a los prompts | **A-** crítica para calidad de agentes |
| `automation/templates/` (scaffold `{{VARS}}`) | Templates de client-bootstrap | client-bootstrap (crea clientes nuevos) | **A** para onboarding |
| `agents/*` knowledge (hook-database, winning-formats, prompt-library, seo/*) | Semi-semilla (hook-database: 11 líneas) | content-strategy/creative-assistant/seo leen algunos | **B/D** — parcialmente leído, contenido pobre |
| `agents/*/agent-spec.md` | Specs de diseño; algunos con contenido (content-creator 103 líneas), otros stub (prospecting 2) | **Nadie por código** (huérfanos) | **C** doc humana — y varios **stale** (spec de content-creator sigue, el agente ya no existe) |
| `agency/` + `billing/` + `onboarding/` + `prospecting/` | Conocimiento de negocio | **Stubs de 2 líneas** — nadie los lee | **E hoy** (deberían ser B) |
| `automation/shared-utils/*.md`, `_archive/` | Notas técnicas / cliente archivado | Nadie | **C/E** |

## Las 19 preguntas del brief

1. **¿Qué función cumple Obsidian hoy?** Almacén de contexto por cliente que los agentes leen
   para armar prompts y donde appendean resultados cualitativos; más templates de scaffold; más
   documentación humana (mayormente vacía). No cumple funciones de graph/linking.
2. **¿Qué es?** Mezcla: knowledge base parcial (brand/, strategy) + memoria cualitativa de
   agentes (learning-log, sector-trends) + config de scaffold (templates) + documentación
   humana (specs, stubs). **No** es prompt registry real (los prompts viven en el código de
   cada agente; `prompt-library.md` existe pero casi no se consume) ni workflow registry.
3. **¿Existe código que lea estos archivos?** Sí, dos vías: (a) scripts GHA por filesystem —
   `readVaultFile`/`loadBrandFiles`/`readSectorTrends` en 10 scripts; (b) dashboard por GitHub
   Contents API — `lib/vault-loader.ts` (`loadClientVaultContext`, `loadClientBrand`) y
   `lib/portal-vault-context.ts` (versión filtrada para el portal, excluye learning-log y
   calls-log por privacidad).
4. **¿Qué agentes consumen esta información?** Los de contenido (content-strategy,
   creative-assistant), seo, morning-briefing, reporting-performance, social-media-metrics,
   stock, stock-web, logistics, sector-trends, competitor-scanner (lee `competitors.md`) y los
   4 consultores del dashboard.
5. **¿Cómo encuentran la información correcta?** **Paths hardcodeados por convención**:
   `clients/${client}/learning-log.md` (10 refs), `claude-client.md` (8), `strategy.md` (6),
   etc. No hay búsqueda: si el archivo no está en el path esperado, no existe para el agente.
6. **¿Indexing?** No.
7. **¿Embeddings?** No (0 hits de embedding/pgvector/vector en código de la app).
8. **¿Semantic search?** No.
9. **¿RAG?** No en el sentido de retrieval selectivo: es "context stuffing" — se cargan
   archivos completos y se truncan por presupuesto de caracteres (`buildVaultBlock` maxChars
   16000; `buildSectorTrendsBlock` 3500; `buildPortalVaultBlock` 18000).
10. **¿Links entre notas?** **0** en 117 archivos.
11. **¿Frontmatter estructurado?** **0** en 117 archivos.
12. **¿IDs estables?** Solo el slug del cliente (nombre de carpeta) — coincide con
    `clients.id` de Supabase. Nada más.
13. **¿Relaciones machine-readable?** No. Las relaciones reales viven en el CÓDIGO (qué agente
    lee qué path) y en Supabase (FKs), no en el vault.
14. **¿Taxonomía?** Convención de carpetas (clients/agents/agency/automation), sin esquema
    formal. Hay mezclas: `hook-database.md` existe a nivel agente Y a nivel cliente (dos
    ubicaciones, ambas referenciadas por código distinto).
15. **¿Versionado?** Sí — git es el versionado real (y los workflows commitean outputs, ej.
    "sector-trends: actualización semanal"). Es el punto más sólido del diseño actual.
16. **¿Distinción conocimiento / instrucciones / memoria / estado / prompts / outputs?** Se
    mezclan en el mismo árbol: `strategy.md` (conocimiento) convive con `learning-log.md`
    (memoria), `sector-trends.md` (output regenerado semanal), `content-calendar.md`
    (estado/plan) y `agent-spec.md` (instrucciones humanas). No hay marca formal de qué es qué;
    la distinción está solo en la cabeza del equipo y en qué código lo toca.
17. **¿Qué dejaría de funcionar si se borra el vault hoy?**
    - Agentes GHA de contexto: sector-trends, content-strategy, creative-assistant (vía GHA),
      seo, morning-briefing, reporting, social-media-metrics degradan a prompts casi vacíos o
      fallan (algunos con fallback "Sin datos").
    - client-bootstrap se rompe (templates) → no se pueden crear clientes nuevos.
    - competitor-scanner y stock-web pierden su fuente (competitors.md, `- Web:` de
      claude-client.md).
    - Dashboard: el brand editor se rompe; los consultores pierden el bloque narrativo (fallan
      con gracia a contexto Supabase-only, está atrapado con `.catch(() => null)`).
    - **Siguen funcionando**: portal, solicitudes/ofertas, contenido (tabla), finanzas,
      calendario, equipo, notificaciones, auth — todo lo transaccional vive en Supabase.
18. **¿Y si se borran solo los links?** Nada cambia: no hay links (0) y ningún código los
    parsea. Demostración por vacuidad.
19. **¿El Graph View cumple función funcional?** Ninguna. Es decorativo, y hoy ni siquiera
    decora: al no haber links, muestra puntos inconexos (exactamente lo que viste). La
    desconexión no es un bug — es el síntoma de que los productores de estos archivos son
    agentes que escriben paths aislados y humanos que nunca enlazan.

## Por qué el graph está desconectado (causa raíz)

El vault se pobló **programáticamente** (scaffold + appends de agentes) y por edición puntual
humana. Ninguno de esos flujos crea `[[wikilinks]]`, y como ningún consumidor los necesita
(el lookup es por path), nunca hubo presión para crearlos. El grafo vacío es la foto fiel de
un sistema cuyo "grafo real" está en el código y en las FKs de Postgres.

## Implicación para el target (adelanto del doc 11)

Mantener: **markdown en git como capa de conocimiento cualitativo** (funciona, es versionado,
es editable por humanos y agentes). Corregir: (a) poblar la capa de negocio (hoy stubs) con el
Manual Growth ya entregado; (b) frontmatter mínimo (type/client/updated) solo si se quiere
tooling encima — no por estética; (c) separar formalmente knowledge vs memoria vs outputs
regenerables; (d) specs muertos → archivar. **No** migrar el vault a una base de datos ni meter
vector search hoy: el volumen (117 archivos, 1-2 clientes) no lo justifica.
