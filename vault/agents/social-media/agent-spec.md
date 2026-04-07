# Social Media Agent — Especificacion

## Rol
Toma contenido aprobado y lo adapta para cada plataforma de redes sociales (Instagram, TikTok, LinkedIn, Facebook, Twitter), generando captions optimizados, hashtags estrategicos, y recomendaciones de publicacion. Cuando Blotato MCP esta conectado, publica automaticamente.

NO genera contenido creativo — eso lo hace el Content Creator Agent. Este agente adapta, optimiza, programa, y publica.

## Quien lo activa
| Fuente | Como | Cuando |
|--------|------|--------|
| **Consultant Agent** | Envia un brief JSON via `publishContent(brief)` o `repository_dispatch` | Cuando hay contenido aprobado para publicar |
| **Dashboard** | El dueno del negocio selecciona contenido y plataformas | Publicacion manual |
| **Content Creator Agent** | Cadena automatica despues de aprobacion | Flujo end-to-end |
| **CLI** | `node index.js --brief brief.json` o `node index.js <client> <pieceId>` | Desarrollo y testing |

## Flujo de trabajo
1. Recibe un **brief** (JSON estructurado) de cualquier fuente
2. Lee los 8 archivos obligatorios de la vault
3. Si hay `contentPieceId`, extrae la pieza de `content-library.md`
4. Genera captions adaptados por plataforma via Claude API
5. Parsea el JSON estructurado de publicacion
6. Registra en `social-media-log.md` como PENDING_APPROVAL o SCHEDULED
7. Escribe archivos de cola en `social-media-queue/` (uno por plataforma, para Blotato MCP)
8. Genera reporte JSON para el Consultant Agent en `agent-reports/`
9. Notifica por Telegram
10. Retorna resultado estructurado (para uso programatico)

## Brief — El contrato de comunicacion
Ver `scripts/social-media/brief-schema.js` para el schema completo.

Campos clave:
- `client` — slug del cliente
- `platforms[]` — instagram, tiktok, linkedin, facebook, twitter (una o varias)
- `contentType` — reel, static-ad, carousel, story, text-post
- `source` — quien lo pide: cli, consultant-agent, dashboard, content-creator-agent
- `contentPieceId` — referencia a una pieza aprobada de content-library.md
- `contentText` — texto crudo si no hay pieza referenciada
- `tone`, `angle`, `cta` — direccion de caption
- `scheduledDate`, `scheduledTime`, `autoSchedule` — programacion
- `autoPublish` — flag para publicacion automatica via Blotato MCP
- `requireApproval` — esperar aprobacion del dueno antes de publicar

## Plataformas soportadas

| Plataforma | Max caption | Hashtags | Tono |
|-----------|------------|----------|------|
| Instagram | 2200 chars | max 8 | Visual, aspiracional, emojis moderados |
| TikTok | 4000 chars | max 5 | Directo, conversacional, trending |
| LinkedIn | 3000 chars | max 5 | Profesional, storytelling, valor de negocio |
| Facebook | 63206 chars | max 3 | Cercano, comunitario, invita a comentar |
| Twitter/X | 280 chars | max 2 | Ultra conciso, impactante, hook brutal |

## Reglas de publicacion
1. Cada plataforma tiene su propio caption — NUNCA copiar y pegar entre plataformas
2. Mantener la VOZ DE MARCA del cliente en todas las plataformas
3. Adaptar el CTA segun la plataforma (link in bio, link directo, etc.)
4. Incluir horario optimo basado en metricas o best practices
5. Extraer el mensaje central del contenido aprobado y adaptarlo — no inventar

## Lectura obligatoria de vault (en orden)
1. `vault/CLAUDE.md` — contexto agencia
2. `vault/clients/[client]/claude-client.md` — ADN de marca
3. `vault/clients/[client]/strategy.md` — estrategia activa
4. `vault/clients/[client]/content-calendar.md` — que publicar hoy
5. `vault/clients/[client]/content-library.md` — contenido aprobado
6. `vault/clients/[client]/learning-log.md` — que funciono/que no
7. `vault/clients/[client]/metrics-log.md` — metricas historicas
8. `vault/clients/[client]/social-media-log.md` — publicaciones previas

## Outputs del agente

### social-media-log.md
Registro de cada publicacion con:
- Post ID, fecha, source, status
- Captions adaptados por plataforma
- Checklist de publicacion por plataforma
- Metricas por plataforma (se llenan cuando llegan)

### social-media-queue/*.json
Un archivo JSON por plataforma por publicacion. Contiene caption, hashtags, horario, media path. Listo para ser consumido por Blotato MCP o el dashboard.

### agent-reports/social-media-*.json
Reporte estructurado para el Consultant Agent con estado de la publicacion, datos de cola, y timestamp.

## Fase actual: Fase 1 — Caption Generation + Queue
- Genera captions adaptados por plataforma
- Escribe archivos de cola (JSON) listos para publicacion manual o futura automatizacion
- Notifica por Telegram para revision
- NO publica automaticamente (flag `autoPublish` = false)

## Fases futuras
- **Fase 2:** Integracion con Blotato MCP para publicacion automatica
- **Fase 3:** Programacion inteligente basada en metricas historicas
- **Fase 4:** Recoleccion automatica de metricas post-publicacion
- **Fase 5:** A/B testing de captions entre plataformas

## Integracion con otros agentes
- **Content Creator Agent** → produce el contenido que este agente publica
- **Content Strategy Agent** → define el calendario de publicacion
- **Consultant Agent** → orquesta, decide cuando publicar, aprueba
- **Social Media Metrics Agent** (futuro) → alimenta las metricas de cada post
- **Dashboard** → permite al dueno aprobar, programar, y monitorear publicaciones
