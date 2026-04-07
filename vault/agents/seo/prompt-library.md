# Prompt Library — SEO Agent
## Prompts probados y optimizados

### P001 — Blog Post Generator (Fase 1 - Core)
**Uso:** Generacion de articulo de blog SEO-optimizado completo
**Modelo:** claude-sonnet-4-20250514
**Max tokens:** 8192
**Resultado esperado:** Articulo completo con estructura SEO, meta tags, internal links, y metadata

**Variables requeridas:**
- `pieceType` — tipo de pieza (blog-post, keyword-research, etc.)
- `clientBrand` — claude-client.md del cliente
- `strategy` — strategy.md del cliente
- `keywordDatabase` — keywords conocidos y rendimiento
- `winningPages` — paginas que mejor rankean
- `learningLog` — aprendizajes acumulados
- `seoLibrary` — historico de piezas SEO

**Estructura del output:**
1. Keyword target (principal + secundarios + long-tails)
2. Meta title y meta description optimizados
3. Articulo completo con estructura H1/H2/H3
4. Internal links sugeridos
5. Schema markup sugerido (FAQ, HowTo, Product)
6. Metadata para registro

**Notas:**
- Siempre incluye las 10 reglas de oro en el prompt
- Incluye los 3 formatos de articulo (A/B/C) para que elija el mejor segun el keyword
- Si no hay keyword database, genera keywords basados en el nicho del cliente
- Articulos deben ser featured snippet friendly

---

### P002 — Keyword Research (Fase 1)
**Uso:** Analisis de cluster de keywords para un tema o categoria
**Modelo:** claude-sonnet-4-20250514
**Max tokens:** 4096
**Resultado esperado:** Mapa de keywords agrupado por intent con estimacion de dificultad

**Estructura del output:**
```
## Cluster: [tema]

### Keywords transaccionales (compra directa)
| Keyword | Intent | Dificultad estimada | Prioridad |
|---------|--------|---------------------|-----------|

### Keywords informacionales (educacion)
| Keyword | Intent | Dificultad estimada | Prioridad |

### Long-tail opportunities
| Keyword | Intent | Dificultad estimada | Prioridad |

### Content map
- Keyword X → blog-post formato A
- Keyword Y → product-meta
- Keyword Z → category-meta
```

---

### P003 — Product Meta Generator (Fase 1)
**Uso:** Generacion de meta titles y descriptions para paginas de producto
**Modelo:** claude-sonnet-4-20250514
**Max tokens:** 2048
**Resultado esperado:** Meta tags optimizados para cada producto

**Reglas:**
- Meta title: [Keyword principal] — [Beneficio] | [Brand] (max 60 chars)
- Meta description: [Que es] + [diferencial] + [CTA implicito] (max 155 chars)
- Incluir variaciones para A/B testing
- Considerar keywords transaccionales ("comprar", "precio", "mejor")

---

### P004 — Content Brief Generator (Fase 1)
**Uso:** Generacion de brief detallado para escritor externo o para el propio agente
**Modelo:** claude-sonnet-4-20250514
**Max tokens:** 4096
**Resultado esperado:** Brief completo con target keyword, estructura, competencia, y guia de tono

**Estructura del output:**
```
## Content Brief: [titulo propuesto]

### Target
- Keyword principal:
- Keywords secundarios:
- Search intent:
- Volumen estimado:

### Competencia (top 3 resultados actuales)
- Que cubren
- Que les falta
- Nuestra ventaja

### Estructura propuesta
- H1:
- H2s:
- H3s:
- Word count objetivo:

### Guia de tono y estilo
### Internal links obligatorios
### CTA del articulo
```
