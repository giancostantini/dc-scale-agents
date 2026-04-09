# Reporting Performance Agent — Especificacion
Estado: v1 funcional (simulado, sin APIs de datos directas todavia)
Ultima actualizacion: 2026-04-09

## Responsabilidad
Especialista en metricas de negocio: CAC, LTV, ROAS, margenes, conversion, retention y demas KPIs relevantes. Analiza mercado y competencia. Se adapta al tipo de negocio (eCommerce, servicios, SaaS, retail fisico, IT services).

## Modos de operacion
| Modo | Que hace | Trigger tipico |
|------|----------|----------------|
| metrics | Calcular KPIs actuales del negocio con tendencias y health score | Semanal lunes |
| market | Analisis competitivo, SWOT, benchmarks de industria | Manual o Consultant Agent |
| report | Reporte completo con desglose por canal, action items y resumen ejecutivo | Mensual 1ro |

## Adaptacion por tipo de negocio
| Tipo | KPIs prioritarios |
|------|-------------------|
| ecommerce | AOV, abandono de carrito, ROAS, conversion, tasa de recompra |
| services | CAC, LTV, retencion, margen por proyecto, revenue recurrente |
| physical-retail | Ticket promedio, trafico, ventas/m2, rotacion inventario |
| saas | MRR, ARR, churn, expansion revenue, payback period, NRR |
| it-services | Margen por proyecto, utilizacion, delivery time, backlog |

## Flujo de datos
- **Lee:** CLAUDE.md, claude-client.md, strategy.md, performance-log.md, metrics-log.md, ads-log.md, sales-log.md, learning-log.md
- **Escribe:** performance-log.md, learning-log.md, agent-reports/reporting-performance-*.json
- **Reporta a:** Consultant Agent (via agent-reports)

## Archivos
- `scripts/reporting-performance/index.js` — Logica principal
- `scripts/reporting-performance/brief-schema.js` — Contrato de brief
- `.github/workflows/reporting-performance.yml` — Workflow de GitHub Actions
- `vault/agents/reporting-performance/agent-spec.md` — Esta especificacion
- `vault/clients/{client}/performance-log.md` — Historial de KPIs

## Fase actual
- Fase 1: Simulado (Claude analiza datos de vault y estima KPIs)
- Fase 2: Conectar Supabase (lectura de metricas historicas reales)
- Fase 3: Conectar GA4, Shopify Analytics, Meta Ads API para datos en tiempo real
