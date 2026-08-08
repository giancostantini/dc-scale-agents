# AI-COMPANY-AUDIT — Síntesis maestra

> D&C Scale Partners · Auditoría "AI Company Operating System" · 2026-08-07
> Base: `main` @ `ceb0aa0`. Paquete completo en esta carpeta (01-14). **Nada fue implementado**:
> este documento cierra la fase de diagnóstico y espera aprobación para tocar arquitectura.

## Índice del paquete
01 executive summary · 02 mapa del sistema · 03 auditoría Obsidian · 04 mapa de empresa ·
05 inventario de agentes · 06 inventario de workflows · 07 skills/tools/knowledge ·
08 capacidades y límites de IA · 09 gap analysis · 10 arquitectura target ·
11 datos y memoria · 12 human-in-the-loop · 13 build/buy/connect · 14 roadmap.

---

## TOP 10 HALLAZGOS

1. **El sistema es más sano que su documentación.** `CLAUDE.md`/`vault/CLAUDE.md` describen un
   sistema que ya no existe (content-creator "prioridad #1" y remotion-studio fueron
   ELIMINADOS de main; n8n/Sheets/Blotato/Telegram no están operativos). La realidad — gates
   humanos, jobs deterministas, crons baratos — es mejor que el mapa.
2. **El Manual Growth (el método, 5 fases) no está en el sistema.** `vault/agency/` son stubs
   de 2 líneas; el PDF vivía fuera del repo. Los agentes de fases generan reportes sin conocer
   el método que deberían seguir. (Nota: el brief de esta auditoría mencionaba una "Fase 6 —
   Consolidación" que NO existe en el PDF entregado: el manual real tiene 5 fases.)
3. **Obsidian es clase D — y el graph vacío es un síntoma, no un bug**: 0 wikilinks y 0
   frontmatter en 117 archivos; nada parsea links; el lookup es por paths hardcodeados. La capa
   `clients/` sí es crítica (entra a los prompts de 10 scripts + consultores); la capa de
   negocio está vacía; Obsidian-app es solo un editor.
4. **Falta UN dato para cerrar los loops: métricas de ads.** `content_pieces.metrics` y
   paid-media se cargan a mano → social-media-metrics dormido, hook/winning-databases casi
   vacíos (11 líneas), insights-aggregator agrega poco, reporte mensual F5.5 no automatizable.
   Un conector de lectura (Meta Insights) desbloquea tres áreas.
5. **4 registries de agentes desalineados**: catálogo UI (7), DISPATCHABLE del consultor (8),
   FAST_AGENTS (3), 20 workflows. Alta/baja de un agente toca 4 lugares sin fuente única.
6. **DDL fragmentado en 3 fuentes** (schema.sql + 87 migraciones + `vault/automation/
   supabase-schema*.sql`), con tablas activas sin CREATE TABLE localizable (agent_outputs,
   notifications) y migraciones aplicadas a mano → el esquema de prod solo se conoce
   empíricamente.
7. **El HITL ya existe y está bien puesto**: fases (draft→approve del director→mail), contenido
   (batch→draft→scheduled→published), campañas Meta (spec IA→push humano), solicitudes.
   No hay que inventar una capa de aprobaciones: hay que conservarla.
8. **La coordinación es por datos, no por conversaciones entre agentes** (única arista directa:
   logistics→stock). Cero riesgo de loops hoy. El "grafo real" del sistema está en el código y
   las FKs — por eso el graph de Obsidian no muestra nada.
9. **Cero tests y evals en todo el repo**, idempotencia débil (re-runs duplican outputs/mails)
   y sin alerting de crons caídos. La calidad de agentes solo se mide con señales pasivas
   (aprobaciones, 👍/👎 recién estrenado).
10. **Ventas/prospección es visión sin build** (spec de 2 líneas, stubs de scoring/outreach,
    CRM manual) — la única área donde faltaría "crear" algo, y aún así el diseño correcto es
    AI-assisted con envío humano, no un agente autónomo.

---

## CURRENT STATE (síntesis — detalle en 02/04/05/06)

- **9 áreas reales**: Growth/Estrategia, Contenido, Paid Media, Analytics, Client Success,
  Onboarding, Ops interna, Finanzas, Plataforma (+ Ventas declarada sin build).
- **Flota**: 11 agentes IA + 4 jobs deterministas + 4 consultores; madurez 3-5; los más
  maduros: sector-trends y distill-learnings (5), onboarding pipeline (4).
- **Ejecución**: 7 crons activos (todos semanales salvo stock-web y outlook diarios baratos),
  resto on-demand vía dispatch; fast-path in-process para 3 modos.
- **Datos**: ≈49 tablas bien clasificadas (record/estado/memoria/logs/metering) + bóvedas
  cifradas; vault con capa cliente viva y capa negocio vacía.
- **Humanos**: Gian (dirección/arquitectura/growth/paid), Fede (frontend/dirección), Lucía
  (CM/account), Octavio (editor). Los gates pasan por ellos en el dashboard.

## TARGET STATE (síntesis — detalle en 10/11/12)

**Arquitectura híbrida (Opción D)**: workflows deterministas + eventos de negocio para lo
mecánico; consultores (motor único, 4 configs) como router de intención con `run_agent`
gobernado por un **registry único**; gates humanos exactamente donde están; conocimiento
versionado en git (Manual + SOPs + brand) y estado/memoria en Supabase (v2 consolidada);
**sin** manager-agents, sin orquestador central, sin vector DB al volumen actual, sin colas
externas. Autonomía como privilegio que se gana por tipo de output con datos de aprobación
(GREEN/YELLOW/RED del doc 12).

## GAP (síntesis — detalle en 09)

P0: Manual no versionado · doc maestra falsa · ingestion de métricas · registry único.
P1: DDL/migraciones · tests+evals mínimos · idempotencia · alerting · memoria fragmentada ·
(ventas, si es prioridad). P2: winners/hooks pobres · UGC fuera del sistema · publicación
programada · trazabilidad sugerencia→pieza. P3: retrieval selectivo · frontmatter · limpieza ·
permisos por agente.

## ROADMAP (síntesis — detalle en 14)

Stage 0 higiene de verdad → Stage 1 conocimiento (Manual al vault + memoria unificada) →
Stage 2 cerrar agentes existentes (métricas Meta + evals + idempotencia) → Stage 3 workflows
con estado (onboarding + ciclo mensual + reporte F5.5) → Stage 4 consultor-router + motor común
→ Stage 5 eventos → Stage 6 autonomía selectiva ganada con datos. Ventas como rama paralela
condicionada a prioridad comercial. **Ningún agente nuevo hasta la rama de ventas.**

---

## LAS 24 PREGUNTAS, RESPONDIDAS

1. **¿Qué tenemos realmente construido?** Dashboard completo (hub+portal+finanzas), 15
   agentes/jobs operativos vía GHA/dispatch, 4 consultores, pipeline de onboarding, loop de
   aprendizaje, bóvedas cifradas, metering de costos (docs 02/05/06).
2. **¿Qué es solamente documentación?** Toda la capa `vault/agency` (stubs), specs de
   prospecting y de content-creator (huérfano), shared-utils, y buena parte de los dos
   CLAUDE.md (desactualizados).
3. **¿Qué agentes existen realmente?** Los 19 de la matriz del doc 05 (11 IA + 4 jobs + 4
   consultores), todos con trigger alcanzable verificado.
4. **¿Cuáles son solo prompts?** Ninguno "solo prompt" en scripts; los casos límite son
   prospecting (ni prompt: stub) y las prompt-library del vault (existen pero casi no se
   consumen — los prompts reales viven en el código).
5. **¿Qué procesos ya están automatizados?** Tendencias, destilado de aprendizajes, insights,
   stock-web, competitor sync, digest y mails transaccionales, onboarding scaffold+brandbook,
   generación de fases y briefs (con gate), renovación Outlook.
6. **¿Qué depende aún de humanos?** Producción audiovisual, publicación en redes, carga de
   métricas (el gap), optimización de campañas, ventas completas, finanzas, aprobaciones todas.
7. **¿Qué papel cumple Obsidian?** File-store de markdown en git con paths convencionales:
   contexto de cliente (crítico), templates (crítico en onboarding), doc humana (mayormente
   vacía). No es graph, ni index, ni registry (doc 03).
8. **¿Está correctamente utilizado?** Parcialmente (clase D): la capa cliente sí; las features
   de Obsidian no se usan; la capa de negocio está vacía; hay mezcla de knowledge/memoria/
   outputs sin marcar.
9. **¿Por qué el graph aparece desconectado?** Porque hay 0 links en 117 archivos: los escriben
   agentes y humanos que nunca enlazan, y nada los necesita (lookup por path).
10. **¿Importa funcionalmente?** No. Nada parsea links. Importa solo como síntoma de que la
    capa de relaciones vive en código+FKs, no en el vault.
11. **¿Qué áreas cubrimos?** Las 9 del doc 04 (con matriz de nivel de automatización).
12. **¿Qué áreas faltan?** Ninguna estructuralmente nueva: falta PROFUNDIDAD — ventas (build),
    paid media (loop de lectura), UGC (tracking). CRO/SEO/market-intel son prácticas/skills
    dentro de áreas, no áreas nuevas.
13. **¿Qué agentes faltan?** Con el criterio anti-teatro: casi ninguno. El único candidato real
    a "nuevo" es prospección AI-assisted (si el negocio lo prioriza). Todo lo demás son datos,
    conexiones y cierres de loop sobre agentes existentes.
14. **¿Qué agentes sobran?** content-creator (ya eliminado — falta limpiar rastros); stock/
    logistics quedan "dormidos" (no sobran: catálogo de la vertical automatización); los 4
    jobs deterministas deben dejar de contarse como "agentes".
15. **¿Qué debería ser agente y qué skill?** Agente = donde hay razonamiento con contexto
    (fases, contenido, research, reporting, consultores). Skill = capacidades compartidas ya
    existentes en libs (contexto, memoria, retry, mails). UGC/hooks/ROAS-BE = skills o datos,
    no agentes.
16. **¿Qué workflow y qué agente?** Workflow = onboarding, ciclo mensual, reporte mensual,
    push de campañas (secuencias con gates). Agente = los pasos con juicio dentro de esos
    workflows. El error a evitar: envolver workflows deterministas en un agente.
17. **¿Qué conocimiento estructurar?** Métricas, campañas, planner (ya), objetivos financieros
    de F2.8, colaboraciones UGC, registry de agentes.
18. **¿Qué va a base de datos?** Todo estado/registro/memoria estructurada (ya está) + lo del
    punto 17.
19. **¿Qué permanece en Markdown?** Brand, estrategia narrativa, Manual/SOPs, aprendizajes
    cualitativos, specs — todo lo que humanos editan y Claude ingiere como prosa.
20. **¿Qué arquitectura debería tener la AI Company?** La híbrida del doc 10 (Opción D).
21. **¿Qué nivel de autonomía es realista?** GREEN para informativo-con-fuentes y determinístico
    (ya en prod); YELLOW para todo lo visible al cliente o con dinero (draft IA + gate);
    RED permanente para finanzas/contratos/leads/credenciales. La autonomía se promueve por
    TIPO de output con evidencia de tasa de aprobación, no por fe.
22. **¿Dónde necesitamos humanos?** Juicio estratégico final, relación comercial, producción
    audiovisual, aprobaciones, finanzas, curaduría de marca y de memoria.
23. **¿Primer paso de implementación?** Stage 0 (higiene de verdad: CLAUDE.md reales + registry
    único + limpieza + alerting) — barato, sin riesgo, prerequisito de todo.
24. **¿El camino completo?** Doc 14: Stages 0→6 con criterios de éxito y qué NO construir en
    cada uno.

---

**FIN DE LA AUDITORÍA — deteniéndose aquí según lo acordado.** Ningún cambio de arquitectura,
agentes, vault ni datos fue realizado. El único artefacto producido es esta carpeta de
documentación. Próximo paso: revisión y aprobación de Gian sobre (a) arquitectura target,
(b) prioridades del gap, (c) Stage 0 como arranque.
