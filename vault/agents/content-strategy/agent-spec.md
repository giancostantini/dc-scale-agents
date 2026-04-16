# Content Strategy Agent — Especificacion

## Rol
Genera el calendario de contenido semanal para cada cliente de D&C Scale, basado en el contexto de marca, la estrategia activa, aprendizajes acumulados y tendencias del nicho. Es el cerebro editorial que decide QUE publicar, CUANDO y POR QUE — el Content Creator despues ejecuta.

## Como funciona
1. Lee contexto completo de la vault del cliente
2. Analiza aprendizajes (que funciono, que no)
3. Genera un calendario semanal con posts concretos
4. Escribe el calendario en `content-calendar.md` del cliente
5. Notifica por Telegram con resumen de la semana

## Schedule
Todos los lunes a las 8:00 AM (Uruguay) via GitHub Actions.
Tambien ejecutable manualmente o bajo demanda.

## Lectura obligatoria de vault (en orden)
1. `vault/CLAUDE.md` — contexto agencia
2. `vault/clients/[client]/claude-client.md` — ADN de marca
3. `vault/clients/[client]/strategy.md` — estrategia activa
4. `vault/clients/[client]/content-calendar.md` — calendario previo (para no repetir)
5. `vault/clients/[client]/content-library.md` — piezas ya creadas y su performance
6. `vault/clients/[client]/learning-log.md` — que funciono y que no
7. `vault/clients/[client]/metrics-log.md` — metricas recientes
8. `vault/agents/content-strategy/campaign-templates.md` — templates de campana
9. `vault/agents/content-creator/winning-formats.md` — formatos que funcionan
10. `vault/agents/content-creator/hook-database.md` — hooks top

## Output
Cada entrada del calendario tiene:
- **Dia y hora** de publicacion
- **Plataforma** (Instagram, TikTok, etc.)
- **Tipo de pieza** (reel, static-ad, carousel, story, etc.)
- **Objetivo** (TOF awareness, MOF consideracion, BOF conversion)
- **Angulo/tema** concreto (no generico)
- **Hook sugerido** (primera linea o primer segundo)
- **CTA** esperado
- **Notas** para el Content Creator

## Reglas de planificacion
1. Minimo 5, maximo 7 publicaciones por semana
2. Mix de funnel: ~40% TOF, ~35% MOF, ~25% BOF
3. No repetir el mismo angulo dos dias seguidos
4. Alternar formatos (no 3 reels seguidos)
5. Priorizar angulos que funcionaron (learning-log)
6. Si hay metricas, duplicar lo que funciona y descartar lo que no
7. Incluir al menos 1 pieza de prueba social por semana
8. Los lunes y jueves son mejores para contenido educativo
9. Viernes y fines de semana para contenido emocional/lifestyle

## Formato del calendario
```markdown
## Semana [fecha inicio] — [fecha fin]
Tema central: [tema de la semana]

### Lunes [fecha]
- **Plataforma:** Instagram Reels
- **Tipo:** reel
- **Funnel:** TOF
- **Angulo:** [tema concreto]
- **Hook:** "[hook sugerido]"
- **CTA:** [accion esperada]
- **Notas:** [instrucciones para Content Creator]

### Martes [fecha]
...
```

## Archivos
- Script: `/scripts/content-strategy/index.js`
- Workflow: `/.github/workflows/content-strategy.yml`

## Secrets necesarios
- `ANTHROPIC_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Ejecucion manual
- Terminal: `npm run content-strategy` o `node scripts/content-strategy/index.js dmancuello`
- GitHub: Actions > Content Strategy > Run workflow

## Integracion con otros agentes
- **Morning Briefing** lee el calendario para reportar que toca hoy
- **Content Creator** ejecuta cada pieza segun las instrucciones del calendario
- **Analytics Agent** identifica piezas ganadoras para replicar angulos/formatos exitosos

## Estado
- v1: Calendario semanal basico con contexto de vault
- Pendiente: Integrar tendencias externas (trending topics, competidores)
- Pendiente: Auto-ajustar basado en metricas reales de performance
