---
type: gerencia
updated: 2026-09-11
---

# 📈 Gerencia de Ventas

Área del organigrama (doc 15): **ventas**. Owner humano: socios. Primera flota
IA activa desde 2026-09-08 (los socios dieron el go con el Prospector).

## Flota

| Agente | key técnico | Estado | Qué hace |
|---|---|---|---|
| Prospector de Llamados | `prospeccion` | 🟢 activo (lunes 07:30 UY) | Una corrida por **campaña activa** del CRM: busca llamados laborales públicos de marketing (CM, redes, growth, paid media) — empresa contratando marketing in-house = candidata a tercerizar. Score ≥4 entra a `/pipeline` atado a su campaña; el resto queda en el reporte. Sin campañas, usa el ICP de fallback del [método](../agents/prospeccion/busquedas.md) |

El rol "Redactor de Outreach" del plan original ya existe como herramienta del
dashboard: el **botón de mensaje de cada card en `/pipeline`** redacta el
outreach (LinkedIn/email) con IA para ese lead puntual.

## Qué decide sola vs. gates (no negociables)

- El Prospector **SOLO CARGA** prospectos con su señal y ángulo de pitch.
- **Contacto en frío automático: JAMÁS.** La redacción la pide un humano desde
  el pipeline; el **ENVÍO es siempre humano**. Cerrar, cotizar y prometer:
  humanos.
- Un lead marcado como perdido **no se re-carga** (dedup incluye perdidos).

## Qué existe hoy

- **Pipeline de leads** en el dashboard (`/pipeline`) — kanban con etapas
  prospecto → contacto → propuesta → negociación → cerrado. Lo alimentan: el
  Prospector (lunes), la landing pública, Calendly y la carga manual.
- El estado del pipeline entra solo al [Gerente General](Gerente%20General.md)
  y al Gerente de Ventas vía el digest diario de la gerencia.
- Leads de red propia (ej. comunidad AJE) se trabajan a mano, como siempre.
- **Campañas de prospección** (panel del CRM): definen el ICP de cada
  búsqueda (geografías, puestos, rubros, señales, exclusiones, tope). El
  Prospector corre una vez por campaña activa; pausar una lo detiene de
  verdad. Las métricas del panel se calculan de datos reales (mig 100) —
  antes eran cuatro ceros fijos que nadie escribía.

[Gerente General](Gerente%20General.md) · Dashboard: `/pipeline`
