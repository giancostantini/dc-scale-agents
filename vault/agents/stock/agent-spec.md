# Stock Agent — Especificacion
Estado: v1 funcional (simulado, sin Shopify API directa todavia)
Ultima actualizacion: 2026-04-09

## Responsabilidad
Seguimiento de inventario y ventas. Calcula puntos de reorden basado en velocidad de venta y lead time del proveedor. Alerta cuando hay que mandar a pedir mas stock.

## Modos de operacion
| Modo | Que hace | Trigger tipico |
|------|----------|----------------|
| status | Snapshot actual de inventario: niveles, velocidad de venta, dias restantes | Manual o Consultant Agent |
| forecast | Prediccion de agotamiento y calendario de reposicion con cantidades | Semanal |
| alert | Chequeo urgente de stock bajo (solo productos en peligro) | Diario o post-dispatch Logistics |
| report | Reporte semanal de salud de inventario con KPIs y tendencias | Domingo |

## Formulas clave
- **Tasa de venta diaria** = unidades vendidas ultimos N dias / N
- **Dias de stock restante** = stock actual / tasa de venta diaria
- **Reorder point** = (tasa diaria x lead time) + (tasa diaria x safety stock days)
- **Cantidad a reordenar** = tasa diaria x (lead time + safety stock + lookback window)

## Integracion con Logistics Agent
- Stock y Logistics comparten: stock-log.md, sales-log.md
- Logistics lee stock-log.md para verificar disponibilidad antes de programar envios
- Logistics triggerea Stock (mode: "alert") via repository_dispatch despues de despachar ordenes
- Stock NO triggerea Logistics directamente; el Consultant Agent orquesta esa decision

## Flujo de datos
- **Lee:** CLAUDE.md, claude-client.md, strategy.md, stock-log.md, sales-log.md, learning-log.md
- **Escribe:** stock-log.md, learning-log.md, agent-reports/stock-*.json
- **Reporta a:** Consultant Agent (via agent-reports)

## Archivos
- `scripts/stock/index.js` — Logica principal
- `scripts/stock/brief-schema.js` — Contrato de brief
- `.github/workflows/stock.yml` — Workflow de GitHub Actions
- `vault/agents/stock/agent-spec.md` — Esta especificacion
- `vault/clients/{client}/stock-log.md` — Historial de inventario
- `vault/clients/{client}/sales-log.md` — Historial de ventas

## Fase actual
- Fase 1: Simulado (Claude analiza stock-log.md y sales-log.md manuales)
- Fase 2: Conectar Shopify Inventory API (lectura de stock real)
- Fase 3: Reorden automatico (trigger de compra a proveedores)
