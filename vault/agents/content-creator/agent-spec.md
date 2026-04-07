# Content Creator Agent — Especificacion

## Rol
Produce contenido listo para publicar (videos y statics) para clientes de D&C Scale, basandose en el contexto de la vault, la direccion creativa del Consultant Agent, y ejemplos de referencia.

## Quien lo activa
| Fuente | Como | Cuando |
|--------|------|--------|
| **Consultant Agent** | Envia un brief JSON via `createContent(brief)` o `repository_dispatch` | Cuando la estrategia lo requiere o el cliente pide algo |
| **Dashboard** | El dueno del negocio llena un formulario que genera un brief | Cuando quiere crear contenido manualmente |
| **Strategy Agent** | Ejecuta segun el content-calendar.md | Publicaciones programadas |
| **CLI** | `node index.js --brief brief.json` o `node index.js <client> <tipo>` | Desarrollo y testing |

## Flujo de trabajo
1. Recibe un **brief** (JSON estructurado) de cualquier fuente
2. Lee los 8 archivos obligatorios de la vault
3. Carga ejemplos de referencia (URLs + archivos locales)
4. Genera contenido listo para produccion
5. Registra en `content-library.md` como DRAFT con checklist de produccion
6. Notifica por Telegram
7. Retorna resultado estructurado (para uso programatico del Consultant Agent)

## Brief — El contrato de comunicacion
Todo agente o interfaz que quiera pedir contenido envia un brief JSON. Ver `scripts/content-creator/brief-schema.js` para el schema completo.

Campos clave:
- `client` — slug del cliente
- `pieceType` — reel, static-ad, social-review, headline-ad, collage-ad, carousel
- `source` — quien lo pide: cli, consultant-agent, dashboard, strategy-agent
- `objective`, `scriptFormat`, `emotionalTrigger`, `hookStyle`, `tone`, `angle` — direccion creativa (progresivamente refinada por Consultant Agent)
- `voice` — configuracion de voz para videos
- `visual` — estilo visual, paleta, aspect ratio
- `examples[]` — referencias con URLs y/o archivos + notas de que copiar
- `instructions` — texto libre del Consultant Agent o dueno

## Configuracion progresiva
El Consultant Agent va refinando los parametros del brief con el tiempo:
1. **Inicio:** briefs minimos (solo client + pieceType)
2. **Despues de primeras metricas:** agrega hookStyle, scriptFormat preferido
3. **Con datos acumulados:** especifica tone, emotionalTrigger, voice settings
4. **Maduro:** briefs altamente especificos basados en winning patterns

## Ejemplos de referencia
Aceptados via:
- **Dashboard:** dueno sube archivos (videos/imagenes) → se guardan en `vault/clients/[client]/references/`
- **Consultant Agent:** envia URL (IG, TikTok, YouTube) via WhatsApp → se agrega al brief como `examples[]`
- **Manual:** se agregan directamente a `vault/clients/[client]/references/references.md`

## Fase actual: Fase 1 — Script + Storyboard Generation
- Genera scripts completos y storyboards listos para produccion
- Genera briefs para NanoBanana Pro (statics)
- Genera texto de narracion para ElevenLabs (videos)
- NO produce video/static aun (flags `produceVideo`/`produceStatic` = false)

## Fases futuras
- **Fase 2:** Produccion video con Remotion (produceVideo = true)
- **Fase 3:** Voz con ElevenLabs + statics con NanoBanana Pro
- **Fase 4:** Publicacion con Blotato MCP + recoleccion automatica de metricas

## Lectura obligatoria de vault (en orden)
1. `vault/CLAUDE.md` — contexto agencia
2. `vault/clients/[client]/claude-client.md` — ADN de marca
3. `vault/clients/[client]/strategy.md` — estrategia activa
4. `vault/clients/[client]/content-calendar.md` — que publicar hoy
5. `vault/agents/content-creator/hook-database.md` — hooks top
6. `vault/agents/content-creator/winning-formats.md` — formatos ganadores
7. `vault/clients/[client]/learning-log.md` — que funciono/que no
8. `vault/clients/[client]/ads-library.md` — Meta Ads activos

## Reglas de oro (videos)
1. Primer segundo = pattern interruption + claridad inmediata
2. El cerebro decide en 0.2s si quedarse o scrollear
3. 6 cortes/cambios en primeros 3 segundos
4. Max 3 elementos en pantalla simultaneamente
5. Triple hook: visual + textual (<7 palabras) + verbal
6. No revelar solucion al inicio — mantener intriga
7. Un trigger emocional por video
8. CTA unico y directo al final

## Formatos de script
- **A) Double Drop**: Problema → Solucion parcial → Problema peor → Solucion final + CTA
- **B) Direct Value**: Promesa clara → 3 puntos concretos → Ejemplo real → CTA
- **C) 3x Ranking**: Malo → Normal → Excelente (mejor siempre al final)

## Tipos de static
| Tipo | Funnel | Uso |
|------|--------|-----|
| static-ad | TOF | Desglose de producto, conversion directa |
| social-review | MOF | Prueba social, audiencias tibias |
| headline-ad | BOF | Retargeting, cerrar indecisos |
| collage-ad | TOF | Estilo UGC, feed organico |
| carousel | TOF/MOF | Educacion o showcase de producto |

## Evaluacion de performance (cuando llegan metricas)
- **WINNER** = top 20% en 2 de 3: retencion 3s, watch time %, saves/comments → lanzar como ad
- **AVERAGE** = re-editar primeros 2s con nuevo hook
- **LOSER** = descartar angulo, registrar en learning-log

## Integracion con otros agentes
- **Content Strategy Agent** → define calendario y briefs estrategicos
- **Consultant Agent** → orquesta, refina parametros, envia ejemplos de referencia
- **Meta Ads Agent** → recibe piezas ganadoras para lanzar como ads
- **Dashboard** → permite al dueno solicitar contenido directamente
