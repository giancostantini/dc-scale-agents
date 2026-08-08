# 10 — Target Operating Model (diseño, NO implementado)

## A. Evaluación de las 4 opciones de arquitectura

| Opción | Descripción | Veredicto para D&C |
|---|---|---|
| **A — Orquestador central** | Un agente maestro planifica y delega todo | ✘ Sobredimensionado: un solo punto de falla/costo, agrega latencia y opacidad a flujos que ya son deterministas. El "CEO-agent" es teatro al tamaño actual (2 socios, 2-3 team, 2-3 clientes). |
| **B — Managers por departamento + workers** | Un manager-agent por área coordina worker-agents | ✘ La empresa tiene ~5 humanos; añadir 9 managers sintéticos duplica jerarquía sin volumen que lo justifique. Los "managers" reales son Gian/Fede/Lucía con gates en el dashboard. |
| **C — Event-driven puro sin manager** | Todo por eventos y colas | ◐ Correcto para lo mecánico, pero solo-eventos deja afuera la interacción conversacional que ya funciona (consultores) y sobre-ingenieriza los gates humanos. |
| **D — Híbrida** | Workflows deterministas + eventos para lo mecánico; consultores como routers de intención; gates humanos en el dashboard | ✔ **RECOMENDADA** — es además la dirección que el sistema ya tomó orgánicamente; el target la formaliza y cierra los huecos. |

## B. La arquitectura target (Opción D formalizada)

**Principios**: (1) least-autonomous-component; (2) coordinación por datos y eventos, no por
conversaciones agente-agente; (3) todo lo visible al cliente pasa por gate humano hasta ganarse
el GREEN; (4) un solo registry; (5) conocimiento versionado en git, estado en Postgres.

```mermaid
flowchart TB
  subgraph CAPA1["CAPA 1 · Interfaces humanas"]
    HUB[Hub equipo + gates]
    POR[Portal cliente]
    CONS["Consultores (motor único,<br/>4 configs) = ROUTER de intención"]
  end
  subgraph CAPA2["CAPA 2 · Orquestación"]
    REG[(Agent Registry único<br/>deriva: catálogo UI, dispatch,<br/>fast-path, workflows)]
    EVT["Eventos de negocio<br/>(cliente.activado, fase.aprobada,<br/>metricas.cargadas, pieza.publicada)"]
    WF["Workflows deterministas<br/>(onboarding, ciclo mensual contenido,<br/>reporte mensual)"]
  end
  subgraph CAPA3["CAPA 3 · Ejecutores"]
    AGIA["Agentes IA<br/>(diagnóstico, estrategia, contenido,<br/>research, reporting)"]
    JOBS["Jobs deterministas<br/>(insights, scraper, scanner, scaffold)"]
  end
  subgraph CAPA4["CAPA 4 · Estado y conocimiento"]
    SB[(Supabase: record+memoria+logs)]
    VLT[Vault git: brand+Manual+SOPs]
  end
  HUB & POR --> CONS
  CONS -->|run_agent| REG
  EVT --> WF --> REG
  REG --> AGIA & JOBS
  AGIA & JOBS --> SB & VLT
  SB -->|gates: aprobar| HUB
```

**Qué se agrega vs hoy (delta honesto — poco y quirúrgico):**
1. **Registry único de agentes** (config con: nombre, tipo agente/job, triggers, brief-schema,
   canal fast/GHA, límite de gasto, owner) → de él derivan las 4 listas hoy duplicadas.
2. **Eventos de negocio explícitos**: hoy existen triggers SQL de notifs; formalizar 4-6
   eventos con handlers (cliente.activado→research+diagnóstico draft; fase.aprobada→siguiente;
   métricas.cargadas→social-media-metrics; contenido.publicado→tracking).
3. **Motor común de consultores** (4 configs sobre un solo código: contexto+tools+persistencia).
4. **Ingestion de métricas Meta** (lectura Insights API) — el dato que cierra los loops de
   winners/reporting/optimización.
5. **Workflow state mínimo** para los 2 procesos multi-paso (onboarding y ciclo mensual):
   una tabla `process_instances` (proceso, cliente, paso, estado) — NO un motor de workflows.

**Qué NO construir** (decisión explícita): manager-agents por área; vector DB; colas externas
(Kafka/Redis — GitHub dispatch + triggers SQL alcanzan); multi-repo; capa nueva de aprobaciones
(los gates ya viven en el dashboard); más consultores.

## C. Jerarquía organizacional target

```mermaid
flowchart TB
  COMP[D&C Scale Partners]
  COMP --> GROWTH["GROWTH (owner: Gian)<br/>agentes: diagnostico/estrategia draft,<br/>client-research, sector-trends<br/>jobs: competitor-scanner"]
  COMP --> CONT["CONTENIDO (owner: Lucía)<br/>agentes: content-strategy, creative-assistant,<br/>consultor contenido · humano: producción<br/>skills: hooks, brand, prompts"]
  COMP --> PERF["PAID MEDIA + ANALYTICS (owner: Gian)<br/>spec+push Meta (gate) · reporting<br/>jobs: insights, social-metrics, ingestion ⬥"]
  COMP --> CSX["CLIENT SUCCESS (owner: Lucía)<br/>consultor portal, digest, solicitudes"]
  COMP --> OPS["OPS+PLATAFORMA (owner: Gian+Fede)<br/>onboarding pipeline, registry, costos,<br/>seguridad, distill-learnings"]
  COMP --> FIN["FINANZAS (owners: socios)<br/>sin IA ejecutora — RED"]
  COMP --> SALES["VENTAS (owner: Gian)<br/>hoy manual · target AI-assisted<br/>(research+scoring+drafts)"]
```
Cada área = **owner humano + set de agentes/jobs + gates**. Sin manager-agents: el "manager" es
el humano con su dashboard; los consultores son la interfaz conversacional, no jefes.

## D. Orquestación del flujo New Client (target — diagrama 5)

```mermaid
flowchart TD
  E0[EVENTO: cliente.activado] --> P1[client-bootstrap + brandbook JOBS]
  P1 --> P2[client-research + competitor seed<br/>PARALELO]
  P2 --> P3[Diagnóstico draft IA<br/>con ROAS-BE calculado de datos del wizard]
  P3 -->|GATE director| P4[Estrategia draft IA]
  P4 -->|GATE director + mail cliente| E1[EVENTO: fase.aprobada]
  E1 --> P5[Setup: calendario content-strategy +<br/>briefs creative-assistant]
  P5 -->|GATE CM aprueba batch| P6[Producción humana + spec campañas IA]
  P6 -->|GATE push Meta| E2[EVENTO: campañas.activas]
  E2 --> LOOP[Ciclo continuo:<br/>ingestion métricas ⬥ → insights → winners<br/>→ briefs · trends semanal · reporte mensual draft<br/>→ GATE → cliente]
```
Paralelizable: research+competitor; calendario+briefs. Secuencial duro: diagnóstico→estrategia
→setup (dependencia de contenido intelectual). Outputs estructurados en cada paso (ya lo son:
phase_reports, content_posts, campaign spec). Human gates: 4 (los mismos de hoy).
