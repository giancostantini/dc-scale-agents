---
type: gerencia
updated: 2026-08-12
---

# 📊 Gerencia de Analítica

Área del organigrama (doc 15): **analytics**. Owner humano: Gian. La fuente dura de
métricas (pauta + orgánico de Meta) se ingesta sola a Supabase cuando el token de
agencia está configurado.

## Flota

| Agente | key técnico | Estado | Qué hace |
|---|---|---|---|
| Agregador de Insights | `insights-aggregator` | 🟢 activo | Consolida insights de contenido cross-cliente (lunes) |
| Analista de Performance | `reporting-performance` | ⏸ pausado (on-demand) | Reportes diario/semanal/mensual + preguntas en lenguaje natural; el reporte mensual F5.5 se draftea solo el día 3 |
| Medidor de Redes | `social-media-metrics` | 💤 dormido | Evalúa performance por pieza y alimenta hooks/formatos ganadores — despierta con la ingestión orgánica |

Infra de datos (sin chat): Recolector de Pauta (`meta-insights`, diario) y Recolector
Orgánico (`organic-insights`, diario) — dormidos hasta configurar el token de Meta.

## Qué decide sola vs. gates

- **Sola:** ingerir métricas, evaluar piezas con números reales, consolidar insights, draftear reportes.
- **Gate humano:** NINGÚN reporte llega al cliente sin revisión del director (el auto-envío con spot-check existe pero requiere promoción explícita en `autonomy_settings`).

## Conocimiento del área

- [SOP Reporting](../agency/methodology/sop-reporting.md) · [Fase 5 — Optimización](../agency/methodology/fase-5-optimizacion.md)
- Ejemplo de entregable analítico a cliente: [Spec del dashboard Looker de WizTrip](../clients/wiztrip/looker-dashboard-spec.md)

[Gerente General](Gerente%20General.md) · Dashboard: métricas por cliente + `paid_media_daily`/`organic_posts` en Supabase
