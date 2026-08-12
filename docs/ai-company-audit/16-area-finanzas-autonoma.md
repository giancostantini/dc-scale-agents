# 16 — Área Finanzas Autónoma (diseño)

> Primera área nueva a construir (prioridad de Gian; dolor operativo de Fede). Principio
> inviolable: **la IA/automatización lee, calcula, detecta, draftea y alerta — mover, convertir
> o pagar dinero lo hacen SIEMPRE los socios (RED)**. "Autónoma" = autónoma en preparación y
> vigilancia, no en ejecución financiera.

## Los 5 dolores → 5 capacidades

### F-A · Tesorería multimoneda (el dolor #1)
**Problema real**: 3 clientes pagan USD, 1 paga UYU; egresos en ambas monedas. Hoy la posición
por moneda, el tipo de cambio y la decisión de conversión se manejan a ojo.
**Diseño**:
- Job diario `fx-rates` (determinístico): TC USD/UYU desde fuente pública (BCU) → tabla
  `exchange_rates(date, buy, sell, source)`. Sin IA.
- Vista **Posición de tesorería**: saldo por cuenta y por moneda (ya existe
  `cuentas_bancarias`+`cuenta_movimientos` por moneda) + ingresos/egresos proyectados del mes
  por moneda (fee_schedules + egresos recurrentes) → posición neta UYU y USD.
- **Regla de calce** (configurable): los ingresos UYU cubren egresos UYU primero (el cliente
  que paga en pesos financia los gastos en pesos). Alerta cuando la proyección del mes da
  descalce: *"egresos UYU proyectados $X > ingresos UYU proyectados $Y → habrá que convertir
  ~$Z al TC actual (N pesos/USD)"* — con el monto y el costo de conversión estimado.
- Sugerencia de conversión con umbral (ej. avisar si el descalce supera $500 USD-equiv).
**HITL**: GREEN calcular/alertar/proyectar · **RED convertir/mover** (los socios en el banco).
**Componente**: job + queries + 1 card en Finanzas → panel principal. IA: solo la narrativa
del resumen (opcional).

### F-B · Facturación recurrente
**Problema**: emitir las facturas de cada cliente todos los meses, a mano.
**Diseño**: runner mensual (día configurable) que draftea las facturas del mes desde
`client_fee_schedules` (monto, **moneda del cliente** — infra bi-moneda ya existe) → cola
"Facturas del mes" en Finanzas → Fede revisa/ajusta → aprueba → se emite el PDF (generador ya
existe, mig 054) y se envía por mail (template existente). Registro en `invoice_runs`
(idempotente: cliente+período único — un re-run no duplica).
**HITL**: YELLOW (draft automático, emisión/envío con aprobación). Meta futura (H2, doc 17):
clientes con fee fijo estable → auto-emisión con muestreo, si Fede lo promueve.

### F-C · Cobranzas
**Problema**: perseguir quién pagó y quién no.
**Diseño**: detector diario de vencidos (payments + fecha de pago por cliente, `payment_day`
ya existe) → estado por factura (al día / por vencer / vencida N días) → draft de recordatorio
en el tono D&C → gate → envío. Segundo aviso escala a los socios (notif, no mail automático).
Los pagos en UYU/USD se marcan contra la capacidad F-A (alimentan la posición).
**HITL**: YELLOW en cada envío. RED: cualquier negociación o plan de pago (humano).

### F-D · Conciliación de movimientos
**Problema**: cargar movimientos bancarios a mano y cuadrarlos contra lo registrado.
**Diseño**: (1) import de extracto **CSV** (formatos de los bancos que usan; sin asumir API
bancaria en UY) → `bank_statements`; (2) matching determinístico (monto+fecha+moneda exactos)
auto-concilia; (3) matching difuso (montos con comisión, fechas corridas, descripciones) lo
propone IA con score → cola "a confirmar" para Fede; (4) lo no matcheado queda en bandeja de
excepciones. Tabla `reconciliations(statement_line → payment/expense/dividend, estado, quién)`.
**HITL**: GREEN matches exactos · YELLOW difusos (confirmación 1-click) · RED crear
movimientos nuevos desde el extracto (Fede decide qué es).

### F-E · Cierre mensual + proyección
**Problema**: armar el cierre y la foto de futuro consume tiempo y sale tarde.
**Diseño**: job de cierre (día 1-3 del mes): números por queries deterministas — ingresos/
egresos por moneda, rentabilidad por cliente (fee - costos asignados - costo IA del panel),
desvíos vs presupuestos (`client_monthly_budgets`/`mkt_budgets`), posición de tesorería,
cashflow proyectado 60-90 días (fees programados + egresos recurrentes + TC actual) — y
narrativa ejecutiva por IA (2-3 párrafos: qué pasó, qué desvía, qué mirar). Draft → gate socios
→ recién entonces es "el cierre" (y alimenta el reporte a clientes si aplica).
**HITL**: YELLOW. La IA jamás "declara" el cierre sola.

## Datos nuevos requeridos (mínimos)

| Tabla | Para | Nota |
|---|---|---|
| `exchange_rates` | F-A, F-E | date+buy+sell+source; job diario |
| `bank_statements` (+lines) | F-D | import CSV por cuenta |
| `reconciliations` | F-D | línea↔registro, estado, confirmador |
| `invoice_runs` | F-B | idempotencia cliente+período |
| (existentes) fee_schedules, payments+payment_day, cuentas+movimientos, presupuestos, invoice PDF, mail templates | F-B/C/A/E | ya en producción |

## Fases de build (track FIN del roadmap v2)

| Fase | Qué entrega | Esf. | Criterio de éxito |
|---|---|---|---|
| **FIN-0** | `exchange_rates` + posición consolidada + alerta de descalce (el dolor #1) | S-M | Fede ve posición UYU/USD real y recibe la alerta de conversión antes de que duela |
| **FIN-1** | Runner de facturación + detector de vencidos + drafts de recordatorio | M | 100% facturas del mes drafteadas solas; 0 vencidos sin detectar |
| **FIN-2** | Import CSV + conciliación (exacta auto, difusa con confirmación) | M-L | ≥80% de líneas conciliadas sin tipeo manual |
| **FIN-3** | Cierre mensual draft + cashflow proyectado | M | cierre listo para revisión el día 2 del mes |

Prerequisito: Stage 0 (registry + higiene). Corre en paralelo con Stages 1-2 del roadmap
general. Cada fase entrega valor sola; el orden ataca el dolor declarado más fuerte primero.

## Métricas del área (las que habilitan promoción a H2)

Horas de Fede/mes en operatoria financiera (baseline a medir → objetivo -60%) · días hasta el
cierre (→ ≤2) · % facturas emitidas a tiempo (→ 100%) · % líneas conciliadas automáticamente
(→ ≥80%) · descalces detectados con ≥15 días de anticipación (→ todos) · % de drafts (facturas/
recordatorios/cierres) aprobados sin edición — cuando esta última se sostenga ≥80% por 2 meses,
el área es candidata a su coordinador conversacional (doc 17, H2) con el que Fede simplemente
hable: "¿cómo venimos este mes?, emití las facturas, ¿a quién le cobro?".
