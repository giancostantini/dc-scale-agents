# Analytics Agent (Reporting Performance) — Especificacion
Estado: v2 (redefinido 2026-04-16) — simulado hasta que el dashboard este listo
Ultima actualizacion: 2026-04-16

## Responsabilidad
Analista de datos del negocio. Genera reportes automaticos (diario / semanal / mensual), identifica oportunidades de mejora con impacto cuantificado en revenue, y responde consultas en lenguaje natural sobre el estado del negocio.

Es el **agente que alimenta el dashboard del cliente** (seccion "Insights / Analytics") con:
- Reporte diario automatico (tipo "pulso del dia")
- Reportes semanales, quincenales y mensuales
- "Inputs clave de mejora" con prioridad ALTA / MEDIA / OPORTUNIDAD y estimacion de impacto $
- Reportes custom bajo demanda (deep dive por canal, cohortes, funnel, LTV/CAC, forecast)
- Respuestas a consultas libres ("¿que campaña tiene mejor ROAS?", "¿por que bajo la conversion la semana pasada?")

## KPIs que analiza (prioritariamente eCommerce)

### Revenue & Ventas
- Revenue total (vs periodo anterior, vs mismo periodo mes anterior)
- Cantidad de ventas
- AOV (ticket promedio)
- Revenue por canal (organico, paid, email, referral)
- Top productos y mix de ventas

### Marketing / Paid
- CAC (Customer Acquisition Cost) total y por canal
- LTV (Lifetime Value) estimado
- LTV/CAC ratio
- ROAS (total y por campaña/canal)
- CPM, CPC, CTR
- Budget spent vs budget planificado

### Conversion & Funnel
- Tasa de conversion (global y por fuente)
- Tasa de abandono de carrito
- Add-to-cart rate
- Checkout completion rate
- Tiempo promedio en el funnel

### Web / Traffic
- Sesiones, usuarios unicos
- Bounce rate
- Session duration promedio
- Mobile vs desktop split
- Paginas mas visitadas
- Fuentes de trafico

### Retencion
- Tasa de recompra
- Dias hasta segunda compra
- Churn estimado

## Modos de operacion

| Modo | Que hace | Trigger | Output |
|------|----------|---------|--------|
| **daily** | Pulso del dia: trafico vs ayer, conversiones, inversion, resumen narrativo | Diario 09:00 AM | Telegram + performance-log.md |
| **weekly** | Reporte semanal completo con comparativa vs semana anterior | Lunes 08:00 AM | performance-log.md + Telegram summary |
| **biweekly** | Reporte quincenal con analisis de tendencias | Manual o cada 14 dias | performance-log.md |
| **monthly** | Reporte mensual cliente-facing con KPIs completos + insights del mes | Dia 1 de cada mes | performance-log.md + PDF-ready markdown |
| **insights** | "Inputs clave de mejora" — lista priorizada de acciones con impacto $ estimado | Diario (piggyback del daily) | Estructurado JSON + performance-log.md |
| **custom** | Reporte ad-hoc con parametros especificos (canal, producto, periodo, cohorte) | On-demand | Markdown report |
| **query** | Responde pregunta en lenguaje natural | On-demand (dashboard chat) | Respuesta textual directa |

## Generacion de "Inputs clave de mejora"
Para cada insight el agente genera:
- **Prioridad:** ALTA (bloqueante para crecimiento) / MEDIA (mejora incremental clara) / OPORTUNIDAD (upside sin riesgo)
- **Titulo:** una linea accionable
- **Contexto:** por que es importante, que metrica lo evidencia
- **Impacto estimado:** en $ / leads / conversiones por mes
- **Accion recomendada:** proximo paso concreto

Ejemplo real del dashboard:
```
ALTA — Landing mobile tiene bounce 58% — oportunidad alta
El 72% del trafico paid llega por mobile pero la pagina tarda 4.2s.
Bajar a <2s puede subir conversion +18%.
Impacto estimado: +$2.400/mes en revenue
```

## Adaptacion por tipo de negocio
| Tipo | KPIs prioritarios |
|------|-------------------|
| **ecommerce** (default) | Revenue, AOV, abandono de carrito, ROAS, conversion, tasa de recompra, LTV/CAC |
| services | CAC, LTV, retencion, margen por proyecto, revenue recurrente |
| physical-retail | Ticket promedio, trafico, ventas/m2, rotacion inventario |
| saas | MRR, ARR, churn, expansion revenue, payback period, NRR |
| it-services | Margen por proyecto, utilizacion, delivery time, backlog |

## Flujo de datos

### Fase 1 (actual) — Simulado
- **Lee desde vault:**
  - `CLAUDE.md`, `clients/{client}/claude-client.md`, `clients/{client}/strategy.md`
  - `clients/{client}/performance-log.md` (historial de reportes previos)
  - `clients/{client}/metrics-log.md` (metricas de contenido)
  - `clients/{client}/sales-log.md` (ventas registradas)
  - `clients/{client}/ads-log.md` (datos de ads si existen)
  - `clients/{client}/content-library.md` (performance de contenido)
  - `clients/{client}/learning-log.md` (aprendizajes previos)
- Claude estima KPIs y tendencias en base al contexto
- Genera analisis cualitativo + cuantitativo

### Fase 2 — Supabase
- Lee historial de `agent_runs` y `content_pieces` para contexto agregado
- Cachea calculos diarios en tabla `analytics_snapshots` (a crear)

### Fase 3 — APIs reales (cuando el dashboard este listo)
- **Shopify API:** `/orders`, `/products`, `/checkouts` para ventas, AOV, abandono
- **Meta Marketing API:** `/insights` para spend, ROAS, CTR, CPM por campaña
- **Google Analytics 4 (Data API):** sesiones, bounce, conversiones web
- **Google Ads API:** spend y resultados de campañas Search

## Output files
- `vault/clients/{client}/performance-log.md` — Historial cronologico de todos los reportes
- `vault/clients/{client}/agent-reports/analytics-{YYYY-MM-DD}.json` — Report estructurado (para consumir desde dashboard)
- `vault/clients/{client}/agent-reports/insights-{YYYY-MM-DD}.json` — Inputs clave de mejora (estructurados)

## Integracion con otros agentes
- **Morning Briefing:** lee `performance-log.md` del dia anterior para incluir KPIs en el resumen matutino
- **Content Strategy:** lee `insights-*.json` para identificar angulos ganadores y replicarlos
- **Social Media Metrics:** complementario (per-content evaluation vs business-level KPIs)
- **Stock + Logistics:** consumen datos de ventas del Analytics para forecasting

## Archivos
- `scripts/reporting-performance/index.js` — Logica principal
- `scripts/reporting-performance/brief-schema.js` — Contrato de brief
- `.github/workflows/reporting-performance.yml` — Workflow de GitHub Actions (triggers: daily, weekly, monthly)
- `vault/agents/reporting-performance/agent-spec.md` — Esta especificacion
