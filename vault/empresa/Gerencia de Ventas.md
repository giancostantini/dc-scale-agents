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
| Prospector de Llamados | `prospeccion` | 🟢 activo (lunes 07:30 UY) | Una corrida por **campaña activa** del CRM. Busca señales de compra para **las dos verticales**: *growth* (buscan marketing in-house) y *dev* (buscan tecnología/datos, o el aviso describe un proceso manual automatizable). Clasifica cada hallazgo y lo carga con el tipo correcto; score ≥4 entra a `/pipeline` atado a su campaña. Sin campañas, usa el ICP de fallback del [método](../agents/prospeccion/busquedas.md) |

El rol "Redactor de Outreach" del plan original existe como parte del sistema:
después de cada corrida, la IA redacta el primer contacto de cada prospecto
nuevo y lo deja en la **cola de aprobación** (`/pipeline/mensajes`).

## Cómo sale un mensaje (el gate humano, en lote)

1. El Prospector carga prospectos con el ICP de la campaña.
2. La IA redacta el primer contacto de cada uno → queda en **estado draft**.
3. Un humano revisa, edita si quiere, y aprueba:
   - **Email** → lo manda el sistema por el remitente de outbound (subdominio
     separado: mandar frío desde el dominio del portal arriesga que los
     clientes dejen de recibir sus accesos).
   - **LinkedIn** → se copia y lo pega una persona. Automatizarlo viola los
     términos de LinkedIn y arriesga la cuenta: **no se hace**.
4. Descartar un mensaje es definitivo: no se vuelve a generar.

## De dónde sale el contacto

Se evaluó un proveedor de datos (Apollo) y **se descartó**: su cobertura en
Uruguay —nuestro mercado principal— es de sus zonas más flojas, y su API
exige plan pago. El contacto lo busca el propio agente en fuentes públicas:
el aviso y la web institucional de la empresa.

**Lo que eso consigue es contacto de EMPRESA, no del decisor.** Los avisos
de LinkedIn casi nunca muestran mail (se postula en la plataforma); cuando
un portal sí lo muestra, suele ser una casilla de CVs. Por eso el sistema
separa dos campos:

| Campo | Qué es | Habilita el envío |
|---|---|---|
| Casilla de la empresa | `info@`, `rrhh@`, teléfono, web | **No** |
| Email del decisor | el mail de la persona que decide | **Sí** |

Mandar un pitch comercial a una casilla de CVs es la peor primera impresión
posible en un mercado chico, así que promover un contacto de una columna a
la otra es **siempre una decisión humana**, desde la ficha del prospecto en
el CRM.

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
