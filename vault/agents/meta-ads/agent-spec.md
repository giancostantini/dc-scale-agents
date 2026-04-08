# Meta Ads Agent — Especificacion
Estado: v1 funcional (simulado, sin Meta API directa todavia)
Ultima actualizacion: 2026-04-08

## Responsabilidad
Gestionar campanas de Meta Ads (Facebook + Instagram): crear, activar/desactivar, optimizar, y reportar performance.

## Modos de operacion
| Modo | Que hace | Trigger tipico |
|------|----------|----------------|
| audit | Analiza campanas activas, detecta desperdicio | Manual o Consultant Agent |
| create | Disena nueva campana completa (estructura + ads) | Dashboard o Consultant Agent |
| optimize | Ajusta budgets, audiencias, placements de campanas activas | Semanal o post-reporte |
| report | Genera reporte de performance con ROAS, CPA, tendencias | Semanal |
| toggle | Activa o desactiva campanas especificas | Dashboard o Consultant Agent |

## Integracion con Content Creator Agent
Cuando necesita un creativo para un ad:
1. Genera un brief con contexto de la campana (audiencia, placement, CTA, objetivo)
2. Escribe el brief a `vault/clients/{client}/content-briefs/`
3. Triggerea Content Creator via `repository_dispatch` (si GITHUB_TOKEN disponible)
4. Content Creator produce el creativo → aparece en `content-library.md`
5. Meta Ads Agent puede referenciar el pieceId en futuros ads

## Flujo de datos
- **Lee:** ads-log.md, content-library.md, metrics-log.md, strategy.md, learning-log.md, ads-strategies.md
- **Escribe:** ads-log.md, learning-log.md, agent-reports/meta-ads-*.json
- **Puede escribir:** content-briefs/*.json (para Content Creator)
- **Puede triggear:** Content Creator Agent (via repository_dispatch)
- **Reporta a:** Consultant Agent (via agent-reports)

## Archivos
- `scripts/meta-ads/index.js` — Logica principal
- `scripts/meta-ads/brief-schema.js` — Contrato de brief
- `.github/workflows/meta-ads.yml` — Workflow de GitHub Actions
- `vault/agents/meta-ads/ads-strategies.md` — Knowledge base de estrategias
- `vault/clients/{client}/ads-log.md` — Historial de campanas y acciones

## Fase actual
- Fase 1: Simulado (Claude genera analisis basado en contexto, sin Meta API)
- Fase 2: Conectar Meta Marketing API (lectura de metricas reales)
- Fase 3: Acciones automaticas (crear/pausar campanas via API)
