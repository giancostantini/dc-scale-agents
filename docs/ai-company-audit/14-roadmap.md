# 14 — Roadmap incremental (Stages 0-6)

> Regla: cada stage entrega valor solo, no asume el siguiente, y NO se construye nada del
> stage N+1 antes de cerrar el criterio de éxito del N. Esfuerzos en sesiones de trabajo
> (S≈1, M≈2-4, L≈5+).

## STAGE 0 — FOUNDATION (higiene) · Esf: S-M · Riesgo: nulo
- **Objetivo**: que el sistema se describa a sí mismo con verdad.
- **Construir**: (1) reescribir `CLAUDE.md` + `vault/CLAUDE.md` desde el inventario real de
  esta auditoría; (2) registry único de agentes (JSON/tabla) y refactor de los 4 consumidores
  para derivar de él; (3) limpieza de restos (specs de content-creator → `_archive`,
  mock-data.ts, shared-utils stubs); (4) alerting simple de crons fallidos (notif bell).
- **NO construir**: nada de features nuevas.
- **Éxito**: un Claude/humano nuevo lee CLAUDE.md y obtiene el mapa real; alta de agente = 1 lugar.

## STAGE 1 — KNOWLEDGE · Esf: M · Riesgo: bajo
- **Objetivo**: el método de la agencia versionado y consumible.
- **Construir**: (1) Manual Growth → `vault/agency/methodology/` (una página por fase, texto
  limpio del PDF) + SOPs reales (content-production, onboarding, reporting) + checklists F1.4/
  3.5/4.4/5.3; (2) inyectar metodología por fase al prompt de `phases/generate`; (3) unificar
  memoria: migrar `consultant_memory` legacy → v2, consolidar hook-database en una ubicación;
  (4) documentar qué fuente manda en cada par vault↔DB.
- **NO construir**: frontmatter masivo, vector search, reorganización del vault.
- **Dependencias**: Stage 0 (doc veraz).
- **Éxito**: los reportes de fase citan el método real; una sola memoria de directivas.

## STAGE 2 — SINGLE AGENTS (cerrar los que existen) · Esf: M-L · Riesgo: medio (API externa)
- **Objetivo**: cada agente existente con su loop completo — sin crear agentes nuevos.
- **Construir**: (1) **ingestion Meta Insights API** (lectura de métricas por campaña/pieza →
  `content_pieces.metrics`/tabla de métricas) — el desbloqueador; (2) despertar
  social-media-metrics con datos reales → poblar hook-database/winning-formats/content_insights;
  (3) idempotencia en outputs/envíos; (4) evals mínimos: 3 sets dorados (fases, creative,
  trends) + tasa de aprobación por agente (vista sobre datos existentes); (5) trazabilidad
  `content_posts.origin_run_id`.
- **NO construir**: prospección, publicación automática, orquestación nueva.
- **Dependencias**: token Meta por cliente (existe), Stage 1 opcionalmente en paralelo.
- **Éxito**: el loop del diagrama 8 corre sin carga manual de métricas; se puede responder
  "¿qué % de lo que propone creative-assistant se publica?".

## STAGE 3 — STRUCTURED WORKFLOWS · Esf: M · Riesgo: bajo
- **Objetivo**: los 2 procesos multi-paso con estado explícito y avance semiautomático.
- **Construir**: (1) `process_instances` (proceso, cliente, paso, estado, gate) para
  onboarding E2E y ciclo mensual de contenido; (2) al aprobar una fase → preparar
  automáticamente el draft de la siguiente (hoy es manual); (3) reporte mensual F5.5 como
  workflow: datos+draft IA→gate director→envío.
- **NO construir**: motor de workflows genérico, colas.
- **Dependencias**: Stage 2 (métricas para el reporte mensual con números reales).
- **Éxito**: "¿en qué paso está el cliente X?" se responde con una query, y el sistema empuja
  el paso siguiente solo hasta el gate.

## STAGE 4 — CROSS-DEPARTMENT ORCHESTRATION · Esf: M · Riesgo: medio
- **Objetivo**: los consultores como router único y motor común.
- **Construir**: (1) extraer motor de consultor (contexto+tools+persistencia) con 4 configs;
  (2) ampliar `run_agent` con el registry (permisos+límite de gasto por agente); (3) el
  consultor global puede consultar estado de procesos (Stage 3) y proponer el próximo paso.
- **NO construir**: manager-agents; delegación agente→agente más allá de la lista blanca.
- **Éxito**: pedirle al consultor "arrancá el ciclo de julio para WizTrip" dispara el workflow
  correcto con sus gates.

## STAGE 5 — EVENT-DRIVEN AUTOMATION · Esf: M · Riesgo: medio
- **Objetivo**: que los pasos GREEN no esperen a nadie.
- **Construir**: 4-6 eventos formales con handlers (cliente.activado → research+diagnóstico
  draft; fase.aprobada → siguiente draft; métricas.actualizadas → evaluación de piezas;
  pieza.publicada → tracking). Implementación: triggers SQL/webhooks → dispatch existente.
- **NO construir**: bus externo.
- **Dependencias**: Stages 3-4.
- **Éxito**: el diagrama 5 (target) corre de evento a gate sin intervención entre medio.

## STAGE 6 — SELECTIVE AUTONOMY · Esf: M-L · Riesgo: alto (por eso al final)
- **Objetivo**: promover a GREEN solo lo que se ganó el derecho con datos.
- **Construir**: (1) recomendaciones de presupuesto ads con datos de Insights (SIEMPRE
  YELLOW); (2) promoción por tipo de output: si un tipo mantiene ≥X% de aprobación en N
  ciclos, pasa a auto-con-muestreo (ej. reporte mensual → auto-envío con spot-check); (3)
  publicación programada vía API con aprobación previa por lote; (4) límites de gasto por
  agente enforzados desde el registry.
- **NO construir jamás dentro de este roadmap**: ejecución financiera, contacto en frío
  automático, cambios de presupuesto sin humano.
- **Éxito**: autonomía medida por tipo con rollback trivial (bajar a YELLOW = un flag).

## Prospección/Ventas (rama paralela, condicionada a decisión de negocio)
Si se prioriza comercialmente: su Stage propio tras el 2 — CONNECT Apollo + scoring
determinístico + drafts de outreach IA + envío humano. No antes: hoy el cuello es entregar y
retener, no generar leads que no se pueden atender.

## Secuencia y por qué
0→1 son baratos y desbloquean todo lo demás (verdad + método). 2 es la inversión con más ROI
(un dato — métricas — cierra tres loops). 3-5 formalizan lo que ya pasa a mano. 6 recién cuando
haya historial para justificar cada promoción. **En ningún stage se crean agentes nuevos hasta
la rama de ventas** — coherente con el hallazgo central: sobran ganas de agentes, faltan datos
y conocimiento versionado.
