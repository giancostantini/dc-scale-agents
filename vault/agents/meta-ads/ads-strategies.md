# Meta Ads — Knowledge Base de Estrategias
Ultima actualizacion: 2026-04-08

## Estructura de campanas Meta

### Niveles
1. **Campana** — Objetivo (sales, traffic, leads, awareness, engagement)
2. **Ad Set** — Audiencia, presupuesto, placement, schedule
3. **Ad** — Creativo, copy, CTA, URL destino

### Tipos de presupuesto
- **CBO (Campaign Budget Optimization):** Meta distribuye el presupuesto entre ad sets automaticamente. Mejor para testing inicial.
- **ABO (Ad Set Budget Optimization):** Control manual por ad set. Mejor para escalar ganadores.

## Objetivos y cuando usar cada uno

| Objetivo | Cuando usar | KPI principal |
|----------|-------------|---------------|
| Sales | eCommerce con pixel configurado y eventos de compra | ROAS, CPA |
| Traffic | Llevar gente al sitio, blog, landing | CPC, CTR |
| Leads | Captura de datos (formularios, WhatsApp) | CPL, tasa conversion |
| Awareness | Branding, nuevo producto, nuevo mercado | CPM, Reach, Frequency |
| Engagement | Crecimiento de comunidad, social proof | CPE, interacciones |

## Estrategias de audiencia

### Funnel de audiencias
1. **TOF (Top of Funnel):** Intereses amplios, lookalikes 1-5%
2. **MOF (Middle of Funnel):** Engagement custom audiences (video viewers, page visitors)
3. **BOF (Bottom of Funnel):** Retargeting (add to cart, checkout initiators, past buyers)

### Lookalike audiences
- 1% = mas similar a la seed (menor volumen, mayor calidad)
- 2-5% = balance volumen/calidad
- 5-10% = alto volumen, menor precision (solo para awareness)
- Seed recomendada: compradores de los ultimos 180 dias

### Exclusiones criticas
- Siempre excluir compradores recientes (7-30 dias) de campanas de prospeccion
- Excluir audiencias de retargeting de campanas TOF
- Excluir empleados y paginas propias

## Benchmarks por industria (eCommerce artesanal/cuero)

| Metrica | Benchmark | Bueno | Excelente |
|---------|-----------|-------|-----------|
| ROAS | 2.0-3.0 | 3.0-5.0 | >5.0 |
| CPA | $15-30 | $10-15 | <$10 |
| CTR | 1.0-2.0% | 2.0-3.5% | >3.5% |
| CPM | $5-15 | $3-5 | <$3 |
| Frecuencia semanal | <2.0 | <1.5 | <1.0 |
| Conversion Rate (landing) | 1-2% | 2-4% | >4% |

## Reglas de optimizacion

### Cuando escalar
- ROAS > target por 3+ dias consecutivos
- CPA < target por 3+ dias
- Frecuencia < 2.0
- Escalar incrementalmente (20-30% budget por vez, no duplicar)

### Cuando pausar
- ROAS < 50% del target por 3+ dias
- CPA > 2x target
- Frecuencia > 3.0 (fatigue)
- CTR cayendo >30% vs primera semana

### Cuando cambiar creativo
- Frecuencia > 2.5
- CTR cayendo semana a semana
- Engagement rate cayendo
- El creativo tiene mas de 2-3 semanas activo

### Regla del 20%
- No cambiar mas del 20% del presupuesto de una vez
- No hacer mas de 1 cambio significativo por ad set por vez
- Esperar 3-5 dias despues de cada cambio antes de evaluar

## Estructura de testing (A/B)

### Testing de audiencias
1. Crear 2-3 ad sets con diferentes audiencias
2. Mismo creativo en todos
3. CBO para distribucion automatica
4. Evaluar despues de 3-5 dias o 1000 impresiones por ad set

### Testing de creativos
1. Un ad set, multiples ads (2-4 variaciones)
2. Misma audiencia
3. Variaciones: hook diferente, formato diferente, CTA diferente
4. Meta optimiza automaticamente (DCO)

### Testing de copy
1. Un ad set, mismo creativo visual
2. Variar: headline, copy primario, CTA
3. Evaluar por CTR y conversion rate

## Formatos de ad y mejores practicas

### Single Image (Static Ad)
- Aspecto: 1:1 para feed, 9:16 para stories/reels
- Texto en imagen: <20% del area
- CTA claro y visible
- Colores que contrasten con el feed

### Video Ad (Reel)
- Duracion ideal: 15-30 segundos
- Hook en primeros 3 segundos
- Subtitulos siempre (85% ve sin audio)
- Formato vertical 9:16

### Carousel
- 3-5 slides (mas de 5 pierde atencion)
- Primera slide = hook visual
- Ultima slide = CTA fuerte
- Historia progresiva o catalogo de productos

## UTM Parameters estandar

```
utm_source=meta
utm_medium=paid
utm_campaign={campaign_name}
utm_content={ad_name}
utm_term={adset_name}
```

## Pixel events prioritarios (eCommerce)

1. **PageView** — todas las paginas
2. **ViewContent** — paginas de producto
3. **AddToCart** — boton agregar al carrito
4. **InitiateCheckout** — inicio de checkout
5. **Purchase** — compra completada (con valor)
6. **Search** — busquedas en el sitio

## Horarios optimos (Uruguay + LATAM)

| Dia | Horario optimo | Segundo mejor |
|-----|---------------|---------------|
| Lunes-Viernes | 12:00-14:00 | 19:00-22:00 |
| Sabado | 10:00-13:00 | 18:00-22:00 |
| Domingo | 11:00-14:00 | 17:00-21:00 |

## Integracion con Content Creator Agent

Cuando el Meta Ads Agent necesita un nuevo creativo:

1. Generar brief con contexto de la campana:
   - Objetivo de la campana
   - Audiencia target
   - Placement donde se mostrara
   - CTA requerido
   - Angulo/mensaje clave
2. Escribir brief a `vault/clients/{client}/content-briefs/`
3. Triggear Content Creator via `repository_dispatch`
4. El creativo aparecera en `content-library.md` cuando este listo
5. Referenciar pieceId en la estructura del ad

### Tipos de creativo por objetivo
| Objetivo | Creativos recomendados |
|----------|----------------------|
| Sales | static-ad (producto), reel (demo/unboxing) |
| Traffic | headline-ad (curiosidad), reel (value) |
| Leads | static-ad (beneficios), carousel (antes/despues) |
| Awareness | reel (storytelling), collage-ad (lifestyle) |
| Engagement | reel (trending), carousel (educativo) |
