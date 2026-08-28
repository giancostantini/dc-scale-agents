# WizTrip · Looker Studio — Spec de construcción (guion del build)

> Documento guion para armar el dashboard de 13 páginas. Corrige las fórmulas del brief a
> **sintaxis real de Looker Studio**, deja las custom queries SQL robustecidas, especifica los
> blends y da la hoja de armado componente-por-componente. Sirve tanto para ensamblar a mano
> como para el build asistido por navegador.

## 0. Convenciones y prerrequisitos

- **Report:** ya existe con fuentes conectadas. Para P2/P3/P11 hay que **agregar fuentes nuevas de tipo
  "Consulta personalizada" (PostgreSQL)** — ver §3. Reutilizan las credenciales del Postgres ya autorizado.
- **Tema:** primario violeta `#4A2B7A`, secundario dorado `#D4A017`, fondo scorecards `#F4F4F7`, fondo página blanco, tipografía Roboto / Google Sans. Rango de fechas por defecto **últimos 28 días**, control de fecha + navegación + logo en cada página.
- **⚠️ Verificación de nombres de campo:** los nombres exactos de los campos GA4/Windsor dependen de la versión del conector. Los que marco con **`⚠verif`** hay que confirmarlos contra el selector de campos del reporte real durante el build (los ajusto en vivo). El resto son estándar.
- **Regla de oro Looker que rompe el brief:** `REGEXP_MATCH` en Looker exige **match de la cadena completa**, no parcial. Todo patrón `^algo` debe terminar en `.*` o usar `CONTAINS_TEXT`. Y `COUNT IF x = true` **no es sintaxis Looker** → se hace con `SUM(CASE WHEN x THEN 1 ELSE 0 END)` o `AVG(CASE WHEN x THEN 1 ELSE 0 END)` para tasas.

---

## 1. Fuentes de datos (a confirmar en el reporte)

| # | Fuente | Conector | Uso |
|---|---|---|---|
| S1 | GA4 — WizTrip Production (prop. 525097035) | GA4 nativo | P1, P4(blend), P5, P7, P8, P9, P10, P12, P13 |
| S2 | Windsor.ai — Meta Ads (CP Wiztrip) | Windsor/partner | P1, P4, P13 |
| S3 | GSC — sc-domain:wiz-trip.com · **Impresión del sitio** | Search Console nativo | P6 (queries) |
| S4 | GSC — **Impresión de la URL** | Search Console nativo | P6 (tabla de páginas) — fuente aparte |
| S5 | Postgres Supabase — vista directa `vw_conversation_insights_marketing` | PostgreSQL | P2, P3, P11 (scorecards/tablas simples) |
| S6 | Postgres **custom query · destinos** (UNNEST) | PostgreSQL / consulta personalizada | P2, P11 |
| S7 | Postgres **custom query · friction_points** (UNNEST) | PostgreSQL / consulta personalizada | P3 |
| S8 | Postgres **custom query · unsupported_destinations** (UNNEST) | PostgreSQL / consulta personalizada | P3, P10 |
| S9 | Postgres **custom query · travel_dates / mes** | PostgreSQL / consulta personalizada | P11 |
| S10 | Postgres **custom query · funnel Wizzo** (UNION) | PostgreSQL / consulta personalizada | P2 (embudo) |

> El host `db.hgpbvcedlrbfpykkxidh.supabase.co` es la **DB de producto de WizTrip**, no la de la agencia. Confirmar que Looker (rangos IP de Google) alcanza el host: si la conexión directa `:5432` falla, usar el **session pooler** de Supabase o allowlistear IPs.

---

## 2. Campos calculados globales (sintaxis Looker corregida)

Crear una vez por fuente y reutilizar. Todos con **guarda de división por cero**.

**Windsor.ai (S2):**
```
ROAS
= CASE WHEN SUM(Amount Spent) > 0
    THEN SUM(Purchase Conversion Value) / SUM(Amount Spent) END

CPL
= CASE WHEN SUM(Leads) > 0                       -- ⚠verif nombre del campo lead en Windsor
    THEN SUM(Amount Spent) / SUM(Leads) END

CTR %
= CASE WHEN SUM(Impressions) > 0
    THEN SUM(Clicks) / SUM(Impressions) END       -- formatear como %
```

**GA4 (S1):**
```
Ticket promedio
= CASE WHEN SUM(Transactions) > 0
    THEN SUM(Purchase revenue) / SUM(Transactions) END   -- ⚠verif: Purchase revenue vs Total revenue

Tasa de abandono de carrito
= CASE WHEN SUM(Add to carts) > 0
    THEN 1 - (SUM(Transactions) / SUM(Add to carts)) END  -- formatear como %
```

**Blend Windsor+GA4 (ver §4):**
```
CAC
= CASE WHEN SUM(Transactions) > 0
    THEN SUM(Amount Spent) / SUM(Transactions) END
```

**Search Console (S3) — dimensión booleana (nota el `.*` final, sin él siempre da FALSE):**
```
Es consulta de pregunta
= REGEXP_MATCH(Query,
   "(?i)^(qué|que|cómo|como|cuándo|cuando|dónde|donde|cuál|cual|vale|es |conviene|mejor época|mejor epoc).*")
```

**GA4 (S1) — tipo de página para P8 (`.*` en prefijos, `CONTAINS_TEXT` en "contiene"):**
```
Tipo de página
= CASE
    WHEN REGEXP_MATCH(Page path, "^/destino/.*") THEN "Landing destino"
    WHEN REGEXP_MATCH(Page path, "^/paquete/.*") THEN "Paquete"
    WHEN CONTAINS_TEXT(Page path, "/checkout")    THEN "Checkout"
    WHEN CONTAINS_TEXT(Page path, "/chat")        THEN "Chat Wizzo"
    WHEN Page path = "/"                           THEN "Home"
    ELSE "Otras"
  END
```

**Postgres (S5) — flags de tasa (patrón reutilizable; poner agregación = Average para ver el %):**
```
Flag checkout      = CASE WHEN reached_checkout THEN 1 ELSE 0 END
Flag intención     = CASE WHEN agent_understood_intent THEN 1 ELSE 0 END
Flag corrección    = CASE WHEN agent_corrected_by_user THEN 1 ELSE 0 END
Flag escalado      = CASE WHEN agent_escalated_to_human THEN 1 ELSE 0 END
Flag wizzo pick    = CASE WHEN wizzo_pick_followed THEN 1 ELSE 0 END
Flag tool failure  = CASE WHEN tool_failures IS NOT NULL AND tool_failures != '[]' THEN 1 ELSE 0 END
Flag unsupported   = CASE WHEN unsupported_destinations IS NOT NULL AND unsupported_destinations != '[]' THEN 1 ELSE 0 END
Flag info quality  = CASE WHEN info_quality_flag IS NOT NULL AND info_quality_flag != '' THEN 1 ELSE 0 END
```
> Si un booleano llega como texto (`"true"`), usar `CASE WHEN x = "true" THEN 1 ELSE 0 END`. Se confirma en el build.
> Para un scorecard de %, usar el Flag como métrica con agregación **Average** y formato porcentaje (0–1).

---

## 3. Custom queries SQL (PostgreSQL / "Consulta personalizada") — robustecidas

Cast defensivo a `::jsonb` y guarda `jsonb_typeof(...) = 'array'` por si las columnas son `json`/`text`.
Idealmente Germán/Elías las materializan como vistas en `public_app` (mejor performance + refresco).

**S6 · destinos individuales:**
```sql
SELECT
  session_id,
  session_started_at::date AS fecha,
  jsonb_array_elements_text(destinations::jsonb) AS destination,
  satisfaction_score, reached_checkout, abandoned_at_stage,
  lead_time_days, travel_style, budget_level, group_size
FROM public_app.vw_conversation_insights_marketing
WHERE destinations IS NOT NULL
  AND jsonb_typeof(destinations::jsonb) = 'array'
  AND jsonb_array_length(destinations::jsonb) > 0
```

**S7 · friction_points individuales:**
```sql
SELECT
  session_id,
  session_started_at::date AS fecha,
  jsonb_array_elements_text(friction_points::jsonb) AS friction_point,
  conversation_type, abandoned_at_stage
FROM public_app.vw_conversation_insights_marketing
WHERE friction_points IS NOT NULL
  AND jsonb_typeof(friction_points::jsonb) = 'array'
  AND jsonb_array_length(friction_points::jsonb) > 0
```

**S8 · destinos no soportados:**
```sql
SELECT
  session_id,
  session_started_at::date AS fecha,
  jsonb_array_elements_text(unsupported_destinations::jsonb) AS unsupported_destination
FROM public_app.vw_conversation_insights_marketing
WHERE unsupported_destinations IS NOT NULL
  AND jsonb_typeof(unsupported_destinations::jsonb) = 'array'
  AND jsonb_array_length(unsupported_destinations::jsonb) > 0
```

**S9 · mes de viaje (extrae del JSON `travel_dates`):**
```sql
SELECT
  session_id,
  session_started_at::date AS fecha,
  (travel_dates::jsonb->>'month')       AS mes_viaje,
  (travel_dates::jsonb->>'year')        AS anio_viaje,
  (travel_dates::jsonb->>'flexibility') AS flexibilidad,
  lead_time_days, reached_checkout
FROM public_app.vw_conversation_insights_marketing
WHERE travel_dates IS NOT NULL
  AND jsonb_typeof(travel_dates::jsonb) = 'object'
```

**S10 · funnel Wizzo (5 etapas en filas — mucho más robusto que 5 scorecards para un gráfico de barras):**
```sql
SELECT etapa, orden, valor FROM (
  SELECT 'Etapa 1 · Sesiones'            AS etapa, 1 AS orden, COUNT(*)::int AS valor
    FROM public_app.vw_conversation_insights_marketing
  UNION ALL SELECT 'Etapa 2 · Intención entendida', 2,
    COUNT(*) FILTER (WHERE agent_understood_intent)::int
    FROM public_app.vw_conversation_insights_marketing
  UNION ALL SELECT 'Etapa 3 · Opciones mostradas', 3,
    COUNT(*) FILTER (WHERE flight_options_shown IS NOT NULL OR hotel_options_shown IS NOT NULL)::int
    FROM public_app.vw_conversation_insights_marketing
  UNION ALL SELECT 'Etapa 4 · Llegó a checkout', 4,
    COUNT(*) FILTER (WHERE reached_checkout)::int
    FROM public_app.vw_conversation_insights_marketing
  UNION ALL SELECT 'Etapa 5 · Reserva confirmada', 5,
    COUNT(*) FILTER (WHERE linked_reservation_id IS NOT NULL)::int
    FROM public_app.vw_conversation_insights_marketing
) t ORDER BY orden;
```

> **Caveat de rango de fechas en custom queries:** una custom query agregada **ignora el control de fecha** del reporte salvo que uses parámetros `@DS_START_DATE` / `@DS_END_DATE`. Si querés que S10 respete el rango, agregá
> `WHERE session_started_at::date BETWEEN PARSE_DATE('%Y%m%d', @DS_START_DATE) AND PARSE_DATE('%Y%m%d', @DS_END_DATE)`
> en cada subquery. Para S6–S9 (que exponen `fecha` como dimensión) el filtrado se puede hacer con el control de fecha mapeado a `fecha`.

---

## 4. Blends (Windsor + GA4 por `Date`)

**Blend B1 (P4 y P13):** unir S2 (Windsor) y S1 (GA4) con **join key = `Date`** (left join desde el que tenga todas las fechas).
- Campos de S2: `Amount Spent`, `Purchase Conversion Value`, `Leads`, `Clicks`, `Impressions`.
- Campos de S1: `Transactions`, `Purchase revenue`, `Item category`, `Item revenue`.
- **Reglas de blend:** las métricas del blend hay que agregarlas con `SUM()` dentro de los campos calculados (ROAS, CAC por categoría). No re-agregar métricas ya agregadas.
- **ROAS por categoría** = `SUM(Item revenue) / SUM(Amount Spent)` con `Item category` como dimensión.
- **CAC por categoría** = `SUM(Amount Spent) / SUM(Transactions)` (Transactions de esa categoría vía Item-scoped).
- ⚠️ **Aproximación declarada:** el Amount Spent diario se reparte por proporción de revenue de cada categoría; no es atribución exacta. Dejar nota al pie en P4/P13.

---

## 5. Hoja de armado por página

Notación: **SC** = scorecard · **serie** = time series · **barH** = barras horizontales · **tabla** · **donut** · **scatter**.
Cada componente: `tipo | fuente | dimensión | métrica | filtro | orden`.

### P1 — Resumen Ejecutivo · S1 + S2 + S5
- Fila SC (5): `Purchase revenue` (Ingresos) · `Transactions` · `Ticket promedio` · `Session key event rate` **⚠verif** (era "Session conversion rate") · `ROAS` (S2).
- serie doble | S1 | `Date` | `Purchase revenue` (eje izq) + `Sessions` (eje der).
- donut | S1 | `Session default channel group` | `Sessions`.
- tabla (top 5) | S1 | `Item name`, `Item category` | `Item revenue`, `Items purchased` **⚠verif** | orden `Item revenue` desc, límite 5.
- SC extra | S5 | — | `Flag checkout` (agregación Average, formato %). Etiqueta "% Wizzo → checkout".
- Texto fijo (pie): *"Los datos de Wizzo se actualizan una vez por día desde la base de análisis conversacional."*
- (Opcional) bloque "Próximamente Fase 2": tabla estática WhatsApp / Email / Upselling — ver §6.

### P2 — Wizzo: Performance del Chat · S5 + S6 + S10
- Fila SC (4): `Record Count` (Total conv.) · `Flag checkout` avg % · `AVG satisfaction_score` **⚠verif** (campo `satisfaction_score`, agregación Average) · `AVG lead_time_days`.
- **Embudo 5 etapas** | **S10** | `etapa` | `valor` | orden `orden` asc → barH decreciente. (Evita pelear con 5 flags en un solo gráfico.)
- barH top destinos | **S6** | `destination` | `Record Count` | orden desc, límite 10.
- barH punto de abandono | S5 | `abandoned_at_stage` | `Record Count` | filtro `abandoned_at_stage IS NOT NULL` | orden desc.
- tabla por tipo de conversación | S5 | `conversation_type` | `Record Count`, `Flag checkout` avg %, `AVG satisfaction_score`, `AVG lead_time_days`.
- Fila SC (2): `Flag wizzo pick` avg % · `Flag intención` avg %.
- barH `budget_level` | S5 | `budget_level` | `Record Count` (Low/Medium/High/muy_alto).
- tabla perfil del viajero | S5 | `travel_style` / `group_size` / `has_children` | `Record Count` + % del total. (3 tablas chicas o una con selector.)
- Nota: `explicit_budget` (JSON) → si no se parsea fácil en Looker, mostrar como texto/omitir; el nº agregado vive mejor en una custom query.

### P3 — Wizzo: Calidad del Agente · S5 + S7 + S8
- Fila SC (4): `Flag corrección` avg % · `Flag escalado` avg % · `Flag tool failure` avg % · `Flag unsupported` avg %.
- barH friction points | **S7** | `friction_point` | `Record Count` | orden desc.
- barH destinos no soportados | **S8** | `unsupported_destination` | `Record Count` | orden desc. *(clave para catálogo)*.
- tabla commercial_promises | S5 | `commercial_promises` | `Record Count` | filtro `commercial_promises IS NOT NULL AND commercial_promises != '[]'`.
- SC | S5 | `Flag info quality` avg %.
- serie | S5 | `session_started_at` (por semana) | `AVG satisfaction_score`.
- barras | S5 | `urgency` | `Record Count`.

### P4 — Meta Ads · S2 (+ B1)
- Fila SC (4): `Amount Spent` · `ROAS` · `CPL` · `CTR %`.
- serie doble | S2 | `Date` | `Amount Spent` (izq) + `Purchase Conversion Value` (der).
- barH | S2 | `Campaign Name` | `ROAS` | orden desc.
- tabla campañas | S2 | `Campaign Name` | `Amount Spent`, `Impressions`, `Clicks`, `CTR %`, `Action Purchase`, `Purchase Conversion Value`, `ROAS`, `CPL`.
- barras agrupadas | **B1** | `Item category` | `Amount Spent` (Windsor) + `Item revenue` (GA4) → ROAS categoría. Nota al pie de aproximación.

### P5 — Tráfico Orgánico y Directo · S1
- Fila SC (4): `Sessions` (filtro `Session default channel group = Organic Search`) · `Sessions` (filtro `= Direct`) · `New users` · `Engagement rate`.
- serie doble | S1 | `Date` | dos series de `Sessions` filtradas (Organic / Direct). *(usar 2 gráficos superpuestos o control de filtro).*
- donut | S1 | `Session default channel group` | `Sessions` | filtro: excluir `Paid Search` y `Paid Social`.
- tabla | S1 | `Session source / medium` | `Sessions`, `Total users`, `Engagement rate`, `Key events` **⚠verif** (Conversions), `Purchase revenue`.
- tabla | S1 | `Landing page` **⚠verif** | `Sessions`, `Average session duration`, `Bounce rate` | filtro `Session default channel group = Organic Search`.

### P6 — SEO Generativo y Zero-Click · S3 (+ S4)
- Fila SC (4): `Impressions` · `Clicks` · `Site CTR` · `Average Position`.
- serie doble | S3 | `Date` | `Impressions` (izq) + `Clicks` (der).
- tabla top queries | S3 | `Query` | `Impressions`, `Clicks`, `Site CTR`, `Average Position` | orden `Impressions` desc.
- tabla "Consultas que la IA prioriza" | S3 | `Query` | mismas métricas | filtro `Es consulta de pregunta = TRUE`.
- barH | S3 | `Device Category` **⚠verif** (Device) | `Clicks`.
- tabla top páginas | **S4** (Impresión de la URL) | `Landing Page` | `Impressions`, `Clicks`, `Site CTR`.

### P7 — Embudo de Conversión Web · S1
- Fila SC (4): `Sessions` · `Event count` (filtro `Event name = view_quote`) · `Event count` (`begin_checkout`) · `Transactions`.
- **Embudo 5 etapas** | S1 | `Event name` | `Event count` | filtro `Event name IN (session_start, view_quote, add_to_cart, begin_checkout, purchase)` | orden desc. Mostrar % entre etapas.
- barH tasas etapa-a-etapa: 4 SC/campos calculados con las razones del brief (view_quote/Sessions, add_to_cart/view_quote, begin_checkout/add_to_cart, Transactions/begin_checkout) — cada una `CASE WHEN den>0 THEN num/den END`.
- serie | S1 | `Date` | `Event count` | filtro `Event name = checkout_abandoned`.
- tabla por categoría | S1 | `Item category` | `Items viewed` **⚠verif**, `Add to carts`, `Transactions`, `Purchase rate` **⚠verif**.
- SC tasa de abandono | S1 | `Tasa de abandono de carrito` (%). Texto fijo: *"En viajes, 80–90% de abandono es normal. Los usuarios comparan durante semanas antes de decidir."*

### P8 — Comportamiento en el Sitio · S1
- Fila SC (4): `Average session duration` · `Views per session` · `Bounce rate` · `Engagement rate`.
- barH top 10 páginas | S1 | `Page path` **⚠verif** (Page path and screen class) | `Views` | orden desc, límite 10.
- barH | S1 | `Tipo de página` (campo §2) | `Bounce rate`.
- tabla | S1 | `Page path` | `Views`, `Sessions`, `Average session duration`, `Bounce rate`, `Key events`.

### P9 — Destinos y Paquetes · S1 (e-commerce)
- Fila SC (4): `Items purchased` (comprados) · items distintos (`COUNT_DISTINCT(Item name)`) · `Item revenue`/`Item quantity` **⚠verif** · tasa de conversión de producto (`Items purchased`/`Items viewed`, con guarda).
- tabla catálogo | S1 | `Item name`, `Item category` | `Items viewed`, `Add to carts`, `Items purchased`, `Item revenue`, `Item purchase-to-detail rate` **⚠verif** | orden `Item revenue` desc.
- scatter | S1 | burbujas `Item name` | X=`Items viewed`, Y=`Items purchased`. Interpretación: sup-izq = alta conversión / baja visibilidad → oportunidad de pauta.
- barras agrupadas | S1 | `Item category` | `Items viewed` + `Items purchased`.
- serie | S1 | `Week` | `Item revenue` por `Item category` (4 líneas: vuelo/hotel/paquete/seguro).

### P10 — Salud Técnica · S1 (eventos) + S5 (tool_failures)
- Fila SC (4): tasa error búsqueda (`Event count` `api_error` / búsquedas) · sin inventario (`no_inventory`/búsquedas) · timeout checkout (`checkout_timeout`/`begin_checkout`) · `Flag tool failure` avg % (S5).
- serie | S1 | `Date` | `Event count` × 3 series (`api_error`, `no_inventory`, `checkout_timeout`).
- barras | S5 | `tool_failures` | `Record Count`.
- tabla | **S8** | `unsupported_destination` | `Record Count` | orden desc.
- SC texto fijo: *"Comparar picos de error con caídas en la conversión del embudo (P7)."*
- **⚠ Pendiente:** eventos `api_error`/`no_inventory`/`checkout_timeout` los implementa dev de WizTrip (Germán/Elías). Dejar los gráficos armados con overlay: *"Pendiente de implementación técnica — datos disponibles una vez que dev active los eventos."*

### P11 — Anticipación y Estacionalidad · S5 + S6 + S9
- Fila SC (3): `AVG lead_time_days` · mes con más consultas (moda de `mes_viaje` de S9) · tasa de cancelación (**placeholder** GA4).
- histograma | S5 | `lead_time_days` en rangos (0-7, 8-15, 16-30, 31-60, 61-90, 90+) — bins vía campo calculado CASE | `Record Count`.
- barras | **S9** | `mes_viaje` | `Record Count`.
- barras agrupadas | **S6** | `destination` | `AVG lead_time_days`.
- serie | S5 | `session_started_at` (semana) | `Record Count`.
- Texto fijo: *"Una venta no es firme hasta pasar la ventana de cancelación. Mayor lead time → mayor probabilidad de cancelación."*

### P12 — Retención, LTV y NPS · S1 (+ Google Sheets NPS futuro)
- Fila SC (4): compradores nuevos (`New users` con `Transactions>0`) · recurrentes (`Returning users` con `Transactions>0`) · LTV (`Purchase revenue`/`Active users`) · NPS (**placeholder** Sheets).
- donut doble | S1 | `New / returning` **⚠verif** | (a) compradores, (b) `Purchase revenue`.
- tabla cohortes | S1 | `Cohort` **⚠verif — GA4 en Looker no expone cohortes fácil; si no está, dejar placeholder** | usuarios, revenue m1/m3/m6.
- barras | S1 | `New / returning` | `Purchase revenue`.
- SC NPS + tabla NPS por destino: **placeholder** — *"Conectar Google Sheets con encuesta post-viaje: columnas NPS score (0-10), destino, fecha."*

### P13 — Atribución de Canales · S1 (+ B1)
- Fila SC (4): días hasta compra (`Days to conversion` **⚠verif — puede no existir en el conector; si no, usar histograma con lo disponible u omitir**) · % ventas 1 touchpoint (comparar first vs session source) · CAC blended (B1) · CAC por categoría (B1).
- barH dobles | S1 | `First user default channel group` vs `Session default channel group` | `Transactions`.
- tabla | S1 | `Session default channel group` | `Sessions`, `Transactions`, `Purchase revenue`, `CAC`.
- barras | **B1** | `Item category` | `CAC` por categoría.
- histograma | S1 | `Days to conversion` en rangos (0-1,2-7,8-14,15-30,31-45,45+) | `Transactions`. (Sujeto a que exista el campo.)

---

## 6. Gotchas y pendientes (consolidado)

- **P10 y P12** tienen datos que dependen de terceros → dejar armados con mensaje de pendiente (eventos técnicos de dev; NPS de Sheets; cohortes de GA4).
- **Campos `⚠verif`**: confirmar nombre exacto contra el conector en el build. Los más probables de diferir: `Session key event rate` (ex "conversion rate"), item metrics (`Items viewed/purchased`, `Item purchase-to-detail rate`, `Purchase rate`), `Days to conversion`, `Cohort`, `New / returning`, `Device`, `Landing page`, `Page path and screen class`, campo de leads en Windsor.
- **REGEXP_MATCH** siempre con `.*` o `CONTAINS_TEXT` (ya aplicado en §2).
- **Custom queries** ignoran el date-picker salvo `@DS_START_DATE/@DS_END_DATE` (S10) o dimensión `fecha` mapeada (S6–S9).
- **Reachability Postgres**: si `:5432` directo falla desde Looker, usar session pooler / allowlist IPs de Google.
- **Límite GA4 directo**: 10 GB/día de procesamiento; si escala, extraer vía BigQuery.
- **Blend B1** es aproximación (reparto de spend por proporción de revenue) — nota al pie en P4/P13.

**Bloque "Próximamente — Fase 2" (P1 pie o P14 opcional), tabla estática:**

| Canal | Qué mediremos | Estado |
|---|---|---|
| WhatsApp | Consultas, tiempo de respuesta, cierres | Pendiente de integración |
| Email marketing | Open/click rate, conversiones por flujo | Pendiente de herramienta CRM |
| Upselling (seguros, eSIM, actividades) | Tasa de adhesión por producto y destino | Pendiente de datos |

---

## 7. Progreso del build y próximos pasos (actualizado 2026-07-09)

**Contexto crítico:** el reporte NO estaba vacío — era un **clon del dashboard de "Glassy"** (otro cliente D&C, ecommerce de ropa). Componentes huérfanos (perdieron su fuente) + textos de Glassy. Se reconstruye reapuntando componentes (el auto-mapeo de la plantilla preserva métricas/dimensiones). URL: `datastudio.google.com/reporting/1f8c58ca-2be5-4bda-9adf-b5d7d8a356a3`.

**Fuentes conectadas:** GA4 "WizTrip Production" (⚠ **campos en ESPAÑOL**: "Total de ingresos", "Categoría del artículo", etc.), Windsor.ai, Search Console, PostgreSQL directo ("PostgreSQL - postgres" → vista Wizzo). **Reachability Postgres CONFIRMADA** (124 conversaciones) — la fuente directa alcanza; solo el UNNEST de destinos necesita custom query.

**✅ 11 páginas CONSTRUIDAS y VISIBLES en el nav (2026-07-09):**
1. Portada · 2. Overview · 3. Meta Ads · 4. Google Ads · 5. Tráfico orgánico · 6. SEO Generativo & Zero-Click · 7. Comportamiento en sitio · 8. Funnel de Conversión · 9. Wizzo · Performance · 10. Análisis de productos · 11. Retención y LTV.

**Datos reales confirmados:** Overview/Tráfico/SEO/Comportamiento/Funnel = GA4 · Wizzo·Performance = Postgres directo (124 conv, satisfacción 3,69, lead time 85 d, 5,46 msg/conv) · Análisis de productos = GA4 (Vuelo a Santiago $838, ingreso/unidad $443) · Retención y LTV = cohortes GA4 (new $440 / returning $426, LTV $433). **Meta Ads + Google Ads = misma estructura** (título + 4 scorecards + combo chart + tabla de campañas) sobre Windsor.ai, ambas "No hay datos" (WizTrip no corre paid aún). Google Ads se clonó de Meta (Ctrl+A/C/V + relabel). Para review: ambas comparten la MISMA fuente Windsor.ai y las labels son las de Meta — repuntar a stream Windsor de Google Ads o campos GA4 "Google Ads" cuando haya inversión real.

**Próximos pasos (deferido — necesita dev o data, NO bloquea el entregable):**
1. **Deep-dives de Wizzo** (destinos top, anticipación/lead-time por destino, friction points, unsupported destinations) — requieren las **4 vistas UNNEST** del `looker-dashboard-sql-handoff.md` (Germán/Elías materializan en `public_app`) o custom queries en Looker. Hoy Wizzo·Performance tiene los KPIs + charts de la fuente directa; los UNNEST son la capa siguiente.
2. **Página de Atribución / ROAS por canal** — requiere gasto de ads real (WizTrip no corre paid hoy); dejar con placeholder hasta que haya inversión.
3. **Salud Técnica** (api_error/no_inventory/checkout_timeout) — eventos que implementa el equipo WizTrip; placeholder previsto.
4. Limpiar textos "Glassy" remanentes (portada, subtítulos).
5. **Cablear `clients.looker_studio_url` en el portal** (Fase C, último paso — la plumbing ya existe: mig 027 + `LookerStudioCard`).

**Trucos de eficiencia (navegador claude-in-chrome) — validados este build:**
- **Un solo tab de reporte abierto.** Con múltiples tabs, el renderer de Looker se congela (screenshots timeout 30s). Cerrar todos y abrir uno fresco lo estabiliza.
- **Mostrar/ocultar página en el nav:** panel "Páginas del informe" → seleccionar fila → aparece **⋮** a la derecha → **"Controlar visibilidad"** → radio **"Mostrar siempre la página a todos los lectores en el modo de vista"** → Confirmar. ⚠ El **ícono de ojo tachado en la fila es solo indicador, NO togglea al clickearlo**.
- Reapuntar componente huérfano: click en la **mitad izquierda** de la caja (evita el modal "Falta la fuente de datos") → tab **Configuración** → dropdown "Select a data source" → elegir fuente. Métrica/dimensión se auto-mapea.
- Orden en el dropdown de fuentes: PostgreSQL (1º) · Windsor (2º) · Search Console (3º) · WizTrip Production/GA4 (4º).
- **Coords:** las capturas varían de tamaño (1568×726 / 1536×770) → SIEMPRE usar coords de la captura MÁS reciente; el drift de escala hace fallar clicks (perdí muchos intentos con coords viejas).
- Nota de datos: ventas GA4 mínimas (2 transacciones — parecen de prueba). Tráfico/SEO/Wizzo/productos/retención sí tienen volumen.
