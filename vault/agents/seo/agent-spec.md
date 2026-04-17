# SEO Agent — Especificacion

## Rol
Genera contenido SEO optimizado (articulos de blog, meta tags, descripciones de producto, keyword research) para clientes de D&C Scale, leyendo contexto completo de la vault antes de producir cualquier pieza.

## Fase actual: Fase 1 — Keyword Research + Blog Generation
- Lee archivos de vault obligatorios del cliente
- Analiza nicho, productos y competencia para identificar keywords
- Genera articulos de blog SEO-optimizados (long-tail, informacional, transaccional)
- Genera meta titles y meta descriptions para paginas de producto
- Registra en seo-library.md como DRAFT
- Notifica por Telegram

## Fases futuras
- Fase 2: Auditoria tecnica SEO automatizada (crawl, velocidad, errores)
- Fase 3: Optimizacion de producto pages (schema markup, descripciones enriquecidas)
- Fase 4: Monitoreo de rankings + reporte automatico de posiciones + link building suggestions

## Trigger
- Manual: `npm run seo` o `node scripts/seo/index.js <client> <piece-type>`
- GitHub Actions: workflow_dispatch con inputs de client y piece_type

## Tipos de pieza soportados
| Tipo | Descripcion | Fase |
|------|-------------|------|
| blog-post | Articulo de blog SEO (1500-2500 palabras) | 1 |
| keyword-research | Analisis de keywords por cluster tematico | 1 |
| product-meta | Meta title + description para paginas de producto | 1 |
| category-meta | Meta title + description para paginas de categoria | 1 |
| content-brief | Brief detallado para escritor externo | 1 |
| technical-audit | Auditoria tecnica SEO del sitio | 2 |

## Lectura obligatoria de vault (en orden)
1. `vault/CLAUDE.md` — contexto agencia
2. `vault/clients/[client]/claude-client.md` — ADN de marca
3. `vault/clients/[client]/strategy.md` — estrategia activa
4. `vault/agents/seo/knowledge-base.md` — conceptos fundamentales (intent, SERP features, etc.)
5. `vault/agents/seo/keyword-database.md` — keywords identificados y su rendimiento
6. `vault/agents/seo/winning-pages.md` — paginas/articulos que mejor rankean
7. `vault/clients/[client]/learning-log.md` — que funciono/que no
8. `vault/clients/[client]/seo-library.md` — historico de piezas SEO generadas

## Reglas de oro
1. Keyword research primero — nunca escribir sin saber que busca el usuario
2. Intent match obligatorio — cada pieza debe mapear a un search intent claro (informacional, navegacional, transaccional, comercial/investigativo). Ver knowledge-base.md seccion 1.
3. Un keyword principal + 3-5 keywords secundarios por articulo
4. Estructura H1 > H2 > H3 siempre jerarquica y con keywords naturales
5. Meta title: max 60 caracteres, keyword al inicio, brand al final
6. Meta description: max 155 caracteres, incluir keyword + CTA implicito
7. Contenido util primero — no keyword stuffing, escribir para humanos que buscan respuestas
8. Links internos obligatorios — cada pieza debe linkear a minimo 2 paginas del sitio
9. Parrafos cortos (max 3 lineas) + bullet points para scannability
10. SERP features first — antes de escribir, mapear que features domina la SERP del keyword (Featured Snippet, PAA, Mapas, Videos, Imagenes) y targetear explicitamente las que apliquen. Documentar en el output. Ver knowledge-base.md seccion 2.

## Formatos de articulo
- **A) Guia Definitiva**: "Todo lo que necesitas saber sobre [X]" — long-form, 2000-2500 palabras, ideal para keywords informativos de alto volumen
- **B) Listicle SEO**: "X mejores [producto] para [uso]" — 1500-2000 palabras, ideal para keywords transaccionales comparativos
- **C) How-To**: "Como [accion] paso a paso" — 1500-2000 palabras, ideal para keywords informativos con intent de accion

## Output
- Pieza SEO completa en seo-library.md con estado DRAFT
- Notificacion Telegram con resumen
- Console output del contenido generado

## Evaluacion de performance (cuando llegan metricas)
- WINNER = top 20% en 2 de 3: posicion promedio < 10, CTR organico > 3%, tiempo en pagina > 2min
- AVERAGE = re-optimizar title tag y primer parrafo, agregar contenido complementario
- LOSER = evaluar si el keyword tiene volumen real, pivotar angulo o descartar

## Integracion con otros agentes
- Content Strategy Agent define topics y calendario SEO → SEO Agent ejecuta
- SEO Agent identifica keywords de alto intent → Content Creator puede crear videos sobre esos temas
- Metricas de Search Console → actualizan keyword-database y winning-pages
- Morning Briefing reporta cambios de posicion significativos
