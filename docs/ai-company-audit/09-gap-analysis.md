# 09 — Gap Analysis (CURRENT vs TARGET)

> Prioridad P0-P3 · Esfuerzo S/M/L/XL. Ordenado por prioridad. Ningún gap implica "crear más
> agentes" salvo donde se indica — la mayoría son datos, conocimiento y cierre de loops.

| # | GAP | Impacto negocio | Impacto técnico | P | Esf | Dependencias | Acción recomendada |
|---|---|---|---|---|---|---|---|
| 1 | **Manual Growth no versionado** (agency/=stubs; PDF fuera del repo) | El método de la agencia no es ejecutable ni consultable por agentes; onboarding de humanos depende de tribal knowledge | Agentes de fases improvisan estructura en vez de seguir el método | **P0** | S | PDF ya entregado | Versionar en `vault/agency/` (metodología por fase + SOPs) e inyectarlo al prompt de phases/generate |
| 2 | **Doc maestra del sistema desactualizada** (CLAUDE.md/vault/CLAUDE.md: content-creator "prioridad #1", Remotion, n8n, Sheets, Blotato, Telegram) | Cualquier humano o Claude nuevo opera con mapa falso | Decisiones erradas de mantenimiento | **P0** | S | auditoría (este doc) | Reescribir ambos CLAUDE.md desde el inventario real |
| 3 | **Ingestion de métricas inexistente** (content_pieces.metrics y paid-media = carga manual) | El loop winners→briefs y el reporte F5.5 corren a media máquina; social-media-metrics dormido | insights-aggregator agrega sobre datos viejos/vacíos | **P0** | M-L | token Meta por cliente (ya existe mig 073) | Conectar Meta Insights API (lectura) → poblar métricas por pieza/campaña |
| 4 | **Registry de agentes cuadruplicado** (UI 7 / dispatch 8 / fast 3 / 20 workflows) | Drift silencioso: agentes invisibles o dispatch roto | Cada alta toca 4 lugares | **P0** | S-M | — | Registry único del que deriven los 4 consumidores |
| 5 | **DDL fragmentado / tablas sin migración** (3 fuentes; agent_outputs y notifications sin CREATE localizable; migraciones pegadas a mano) | Riesgo de romper prod al replicar entorno; onboarding técnico lento | Esquema real solo conocible empíricamente | **P1** | M | acceso a prod | Baseline reconstruida desde prod + una sola carpeta de migraciones + convención de aplicación |
| 6 | **Cero tests / cero evals** en todo el repo | Regresiones invisibles (ya ocurrieron: RLS de dev_tasks sin policies de write) | Refactors caros | **P1** | M | — | Mínimo: smoke de guards/RLS + 3 sets dorados para agentes core (fases, creative, trends) |
| 7 | **Ventas/prospección sin build** (pipeline manual; prospecting=stub; scoring/outreach stubs) | El crecimiento de la propia agencia no escala | — | **P1** (si es prioridad comercial 2026) | L | decisión de negocio | AI-assisted: research+scoring+drafts con envío humano (CONNECT Apollo) — no un "agente vendedor" |
| 8 | **Idempotencia de outputs/envíos** (append-only; re-runs duplican) | Duplicados visibles (outputs, mails) al re-correr | Limpieza manual | **P1** | S | — | Clave agente+cliente+período en agent_outputs y en send-all |
| 9 | **Alerting de fallas de crons** (solo visible en Actions) | Un cron muerto pasa desapercibido días | — | **P1** | S | — | Notif al bell/mail cuando un run termina error |
| 10 | **Memoria fragmentada** (consultant_memory legacy vs v2; learning-log paralelo; sin poda) | Directivas que no llegan a todos los agentes | Doble mantenimiento | **P1** | S-M | — | Migrar legacy→v2; definir learning-log=narrativa, v2=directivas; poda trimestral |
| 11 | **Hooks/winners semi-vacíos y duplicados** (hook-database ×2, 11 líneas) | El "banco de ganadores" del Manual no existe de facto | Prompts citan archivos pobres | **P2** | S (tras #3) | métricas reales | Consolidar en un solo lugar poblado por social-media-metrics |
| 12 | **UGC/influencers fuera del sistema** (Manual F3.1.2/3.3: UGC Point/Pooshlo) | Proceso clave del método sin tracking | — | **P2** | M | decisión | Tracking de colaboraciones (tabla simple) + BUY herramientas |
| 13 | **Publicación programada no integrada** (Meta Business Suite manual; Blotato no implementado) | Fricción operativa de la CM | — | **P2** | M | política YELLOW | Evaluar API de publicación CON gate (no auto-post) |
| 14 | **Trazabilidad sugerencia→pieza** (content_posts.source='ai' sin run_id) | No se puede medir qué agente genera piezas que se publican | ROI de agentes a ciegas | **P2** | S | — | Columna origin_run_id + vista de tasa de aprobación por agente |
| 15 | **Contexto sin retrieval selectivo** (stuffing+truncado) | OK hoy; degradará con escala | Costo/calidad de prompts | **P3** | L | >15-20 clientes | Diferir; pgvector si llega el umbral |
| 16 | **Obsidian sin metadata/links** (0/0) | Solo estética/tooling futuro | — | **P3** | S-M | decisión de tooling | Frontmatter mínimo solo si se construye algo encima |
| 17 | Restos muertos (specs de content-creator, mock-data.ts sin importers, `_archive`, shared-utils docs) | Ruido | Confusión de auditorías futuras | **P3** | S | — | Archivar/borrar en una PR de limpieza |
| 18 | **Permisos por agente** (cualquier director dispatcha todo; service-role total en GHA) | Bajo riesgo hoy (equipo chico) | Blast radius alto ante secret filtrado | **P3** | M | registry (#4) | Límite de gasto por agente + rotación de service key |

## Lo que NO es gap (decisiones correctas a conservar)

- Finanzas sin IA ejecutora.
- Producción de video humana (retiro de content-creator/Remotion = simplificación acertada).
- Crons semanales en vez de diarios (decisión de costos jul 2026).
- Coordinación por datos (no agente→agente).
- Gates humanos en el dashboard para todo lo visible al cliente.
- Sin vector DB al volumen actual.
