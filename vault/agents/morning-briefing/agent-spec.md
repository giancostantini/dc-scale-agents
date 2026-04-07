# Morning Briefing Agent

## Que hace
Genera un resumen matutino diario para el equipo con metricas, contenido pendiente, aprendizajes y foco del dia. Lo envia por Telegram.

## Como funciona
1. Lee contexto de la vault: claude-client.md, learning-log.md, metrics-log.md, content-calendar.md
2. Arma un prompt con toda la info y la fecha actual
3. Llama a Claude API (Sonnet) para generar el briefing
4. Envia el resultado por Telegram

## Schedule
Todos los dias a las 7:00 AM (Uruguay) via GitHub Actions.

## Archivos
- Script: `/scripts/morning-briefing/index.js`
- Workflow: `/.github/workflows/morning-briefing.yml`

## Secrets necesarios
- `ANTHROPIC_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Estado
- v1: Briefing basico sin datos de Shopify
- Pendiente: Integrar Shopify API para metricas reales

## Ejecucion manual
Desde GitHub > Actions > Morning Briefing > Run workflow
