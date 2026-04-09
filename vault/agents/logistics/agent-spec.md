# Logistics Agent — Especificacion
Estado: v1 funcional (simulado, sin API de carriers directa todavia)
Ultima actualizacion: 2026-04-09

## Responsabilidad
Programar pedidos, coordinar con companias de envio, optimizar logistica. Trabaja conjuntamente con el Stock Agent para el seguimiento de ventas e inventario.

## Modos de operacion
| Modo | Que hace | Trigger tipico |
|------|----------|----------------|
| schedule | Planificar proximos envios con fechas, carriers y prioridades | Diario L-V |
| dispatch | Ejecutar envios: confirmar ordenes, generar notificaciones a carriers | Manual o Consultant Agent |
| optimize | Analizar rendimiento logistico y recomendar mejoras | Semanal |
| report | Reporte de performance logistica con KPIs y comparacion de carriers | Viernes |

## Integracion con Stock Agent
- Lee stock-log.md y sales-log.md (datos compartidos con Stock Agent)
- Despues de dispatch, triggerea Stock Agent via repository_dispatch (event_type: "stock") para reconciliar inventario
- Brief de trigger: `{ client, mode: "alert", source: "logistics-agent" }`
- Patron identico a meta-ads → content-creator

## Flujo de datos
- **Lee:** CLAUDE.md, claude-client.md, strategy.md, logistics-log.md, stock-log.md, sales-log.md, learning-log.md
- **Escribe:** logistics-log.md, learning-log.md, agent-reports/logistics-*.json
- **Puede triggear:** Stock Agent (via repository_dispatch)
- **Reporta a:** Consultant Agent (via agent-reports)

## Archivos
- `scripts/logistics/index.js` — Logica principal
- `scripts/logistics/brief-schema.js` — Contrato de brief
- `.github/workflows/logistics.yml` — Workflow de GitHub Actions
- `vault/agents/logistics/agent-spec.md` — Esta especificacion
- `vault/clients/{client}/logistics-log.md` — Historial de envios

## Fase actual
- Fase 1: Simulado (Claude genera planes basados en contexto de vault)
- Fase 2: Conectar Shopify Orders API (lectura de ordenes reales)
- Fase 3: Integracion con APIs de carriers (OCA, DAC, Correo Uruguayo)
