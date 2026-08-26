# WizTrip · Handoff para dev (Germán / Elías)

> **Todo lo que falta del lado de datos para que el dashboard de Looker quede 100%.**
> Este documento es la base para el mail final. Última actualización: **2026-07-16**.
> Los hallazgos de negocio viven en [`dashboard-insights.md`](dashboard-insights.md).

**Resumen de lo que pedimos:**
1. 🔴 Crear 4 vistas SQL (UNNEST de arrays JSON) — **bloqueante**
2. 🚩 Aclarar un campo que devuelve siempre el mismo valor (`agent_understood_intent`)
3. 🚩 ¿Existe un **evento de conversión** en GA4? — hoy el embudo no se puede cerrar
4. 🚩 ¿De dónde salen 210 sesiones clasificadas como **Paid Social**?
5. ⚠️ Confirmar si se van a implementar los eventos de e-commerce en GA4
6. ✅ El `page_view` inicial (14% `not set`) — **RESUELTO por Germán (2026-08-17)**: no es bug de carga, son sesiones reanudadas de WebView mobile; ya mitigado en prod
7. ℹ️ Confirmar si las ventas actuales de GA4 son de prueba

---

## 1. Vistas SQL a crear (UNNEST de arrays JSON) — 🔴 BLOQUEANTE

**Contexto:** el dashboard de marketing de WizTrip (Looker Studio) grafica varios campos que hoy son
**arrays JSON** (`destinations`, `friction_points`, `unsupported_destinations`, `travel_dates`) dentro de
`public_app.vw_conversation_insights_marketing`. Para graficarlos hay que "desanidarlos" (UNNEST).

**Por qué urge:** los **`friction_points`** son el dato que responde **por qué el 85% de las conversaciones de Wizzo abandona** (la mitad justo en la etapa "opciones"). Sin esa vista, esa pregunta —que es la más importante del producto— queda sin responder. No es un nice-to-have.

Arranco conectándolos como **consulta personalizada** directo en Looker (para no frenar), pero por
**performance y refresco** conviene que los materialicen como **vistas** en `public_app`. Cuando existan,
cambio la fuente de Looker de "consulta personalizada" a la vista (más simple y rápido).

> Las 4 vistas exponen una columna `fecha` para que el control de rango de fechas de Looker funcione.
> Todas legibles por el rol `marketing_reader` (solo lectura) que ya usa el dashboard.

```sql
-- 1) Destinos individuales (P2 top destinos, P11 lead time por destino)
CREATE OR REPLACE VIEW public_app.vw_wizzo_destinos AS
SELECT
  session_id,
  session_started_at::date AS fecha,
  jsonb_array_elements_text(destinations::jsonb) AS destination,
  satisfaction_score, reached_checkout, abandoned_at_stage,
  lead_time_days, travel_style, budget_level, group_size
FROM public_app.vw_conversation_insights_marketing
WHERE destinations IS NOT NULL
  AND jsonb_typeof(destinations::jsonb) = 'array'
  AND jsonb_array_length(destinations::jsonb) > 0;

-- 2) Friction points individuales (P3)
CREATE OR REPLACE VIEW public_app.vw_wizzo_friction_points AS
SELECT
  session_id,
  session_started_at::date AS fecha,
  jsonb_array_elements_text(friction_points::jsonb) AS friction_point,
  conversation_type, abandoned_at_stage
FROM public_app.vw_conversation_insights_marketing
WHERE friction_points IS NOT NULL
  AND jsonb_typeof(friction_points::jsonb) = 'array'
  AND jsonb_array_length(friction_points::jsonb) > 0;

-- 3) Destinos NO soportados (P3, P10 — clave para catálogo)
CREATE OR REPLACE VIEW public_app.vw_wizzo_unsupported_destinations AS
SELECT
  session_id,
  session_started_at::date AS fecha,
  jsonb_array_elements_text(unsupported_destinations::jsonb) AS unsupported_destination
FROM public_app.vw_conversation_insights_marketing
WHERE unsupported_destinations IS NOT NULL
  AND jsonb_typeof(unsupported_destinations::jsonb) = 'array'
  AND jsonb_array_length(unsupported_destinations::jsonb) > 0;

-- 4) Mes de viaje (P11 estacionalidad) — extrae campos del objeto JSON travel_dates
CREATE OR REPLACE VIEW public_app.vw_wizzo_travel_month AS
SELECT
  session_id,
  session_started_at::date AS fecha,
  (travel_dates::jsonb->>'month')       AS mes_viaje,
  (travel_dates::jsonb->>'year')        AS anio_viaje,
  (travel_dates::jsonb->>'flexibility') AS flexibilidad,
  lead_time_days, reached_checkout
FROM public_app.vw_conversation_insights_marketing
WHERE travel_dates IS NOT NULL
  AND jsonb_typeof(travel_dates::jsonb) = 'object';

-- Permisos de lectura para el rol de marketing (ajustar nombre de rol si difiere)
GRANT SELECT ON
  public_app.vw_wizzo_destinos,
  public_app.vw_wizzo_friction_points,
  public_app.vw_wizzo_unsupported_destinations,
  public_app.vw_wizzo_travel_month
TO marketing_reader;
```

**Notas:**
- Si las columnas JSON ya son `jsonb` (no `json`/`text`), los `::jsonb` son no-ops inofensivos — dejarlos igual por robustez.
- El **embudo de Wizzo (P2)** se queda como consulta personalizada en Looker (query con `UNION` de 5 etapas, en `looker-dashboard-spec.md` §3 · S10), porque como vista agregada no respetaría el selector de fechas del reporte. Si prefieren una vista, puede ser `public_app.vw_wizzo_funnel` pero sería un total global sin filtro de fecha.
- **Reachability:** ✅ ya confirmada — Looker conecta bien al host y trae filas (206 conversaciones). No hay que tocar nada acá.

---

## 2. 🚩 `agent_understood_intent` devuelve **true en el 100%** de los casos

**Qué vemos:** graficamos el campo como % sobre las **206 conversaciones** del período (19 jun – 16 jul) y da **100,00%**. Ni una sola conversación en `false`.

Los otros flags del mismo grupo **sí discriminan** bien, así que no parece un problema del dashboard:

| Campo | % |
|---|---|
| `agent_understood_intent` | **100,00%** ← 🚩 |
| `agent_corrected_by_user` | 13,59% |
| `agent_loops_detected` | 11,17% |
| `agent_escalated_to_human` | 3,40% |

**La pregunta:** ¿`agent_understood_intent` se está calculando de verdad, o queda hardcodeado en `true` en el análisis? ¿O mide algo distinto de lo que sugiere el nombre?

**Por qué importa:** un flag que nunca es falso no mide nada — hoy esa métrica no sirve para decidir. Y es justo la que debería explicar por qué el usuario abandona.

---

## 3. 🎯 La conversión se cierra en WhatsApp y no se puede atribuir

**Actualización 2026-07-28:** al mapear los 16 eventos de GA4 encontramos que **los eventos de conversión SÍ existen** — el embudo se corrigió y ahora llega hasta la compra:

| Evento | Sesiones | Qué es |
|---|---|---|
| `wizzo_checkout_shown` | 22 | Llegó al checkout (intención de reservar) |
| `wizzo_derivation` | 17 | **Se derivó a WhatsApp** para cerrar |
| `purchase` | 2 | Compró en la web |

**El problema real:** de ~22 con intención de compra, la web solo registra **2 ventas** — porque **la venta se cierra en WhatsApp** (los 17 `wizzo_derivation` lo prueban). Perdemos el ~90% de la conversión en la medición.

**Las preguntas (parte es de Fede / tracking de WhatsApp, parte de dev):**
1. Cuando una conversación se deriva (`wizzo_derivation`), ¿queda algún ID que permita **atadarla después a una reserva concreta**? (para saber cuáles de los 17 terminaron en venta).
2. ¿Se puede enviar un evento de conversión de vuelta a GA4/Meta cuando la venta se cierra en WhatsApp (API de conversiones / evento offline)?
3. Confirmar que `wizzo_checkout_shown` es "checkout mostrado" y no "checkout completado" — para nombrar bien el paso.

**Por qué importa:** es la métrica #1 del negocio y hoy está ciega. Sin esto, todo ROAS de paid y toda tasa de conversión real quedan sin poder calcularse.

---

## 4. ✅ RESUELTO — las 210 sesiones de "Paid Social" son las 2 campañas de Meta

**Ya no es pregunta.** WizTrip corrió **2 campañas de Meta** (~mediados-fin de julio) y aparecen en la página Meta Ads. Esas ~210 sesiones "Paid Social" en GA4 son el tráfico de esos anuncios. No era anomalía.

**Lo único a confirmar del lado datos:** que las campañas estén bien **etiquetadas con UTMs** para que GA4/Windsor las atribuyan correctamente (que caigan en Paid Social y no en Direct/Unassigned). Con solo 2 conversiones totales, **atribuir ventas al paid todavía no es posible** — falta volumen.

---

## 8.bis 🔴 Destinos consultados — bloquea medir las campañas por destino

**Contexto (2026-07-29):** la página "Análisis de productos" hoy lee los *ítems de e-commerce de GA4*, que solo se cargan en las ventas → solo muestra "Vuelo a Santiago" (el único vendido) y **Artículos vistos = 0**. Los destinos que la gente **consulta/mira** (Rio, Cancún, etc.) NO están ahí — están en el campo `destinations` (array JSON) de Postgres, que es una de las vistas UNNEST pendientes (`vw_wizzo_destinos`).

**Urgencia nueva:** WizTrip está **corriendo pauta de Rio de Janeiro**. Sin desanidar `destinations` no podemos responder *"¿la campaña de Rio genera consultas de Rio en Wizzo?"* — la métrica que dice si la pauta por destino rinde.

**Verificado 2026-07-29:** `destinations` SÍ captura los destinos (109 distintos; Madrid 12, Río de Janeiro top-1). Dos temas confirmados:

1. 🔴 **Normalización:** el mismo destino aparece con distintas grafías — `["Río de Janeiro"]` (7) y `["Rio de Janeiro"]` (5) son el MISMO (real = 12). La vista `vw_wizzo_destinos` debe **normalizar acentos/mayúsculas/espacios** (ej. `unaccent(lower(trim(...)))`), si no cada destino queda subestimado y partido.
2. Materializar `vw_wizzo_destinos` (UNNEST + normalizado) para graficar "Top destinos consultados" y cruzarlo con las campañas (ej. Rio).
3. **Interés fuera de Wizzo:** `destinations` cubre solo a quienes usan el chat (~14%). Para medir el interés por destino en TODA la web hace falta que el sitio dispare el evento `view_item` de GA4 (hoy no existe → "Artículos vistos = 0"), o que las URLs de vuelos/paquetes incluyan el destino. Definir con el equipo web.

---

## 8. 🔴 Embudo secuencial de Wizzo — vista SQL (para el dashboard)

**Contexto:** el embudo de conversaciones de Wizzo hoy se grafica en Looker, pero Looker **no valida secuencia** (cuenta cada etapa por separado). Para un embudo secuencial real —cuántas conversaciones llegaron *hasta* cada etapa en orden— necesitamos una vista.

**Buena noticia:** el campo **`abandoned_at_stage`** ya guarda la etapa más lejana que alcanzó cada conversación (o NULL si completó). Con eso se reconstruye el embudo ordenado sin datos nuevos.

**La pregunta:** ¿pueden materializar una vista tipo `vw_wizzo_funnel_secuencial` que devuelva, por cada etapa del flujo (inicio → preferencias → opciones → selección → checkout), **cuántas conversaciones la alcanzaron**? La lógica: una conversación "alcanzó la etapa X" si `abandoned_at_stage` es X o una etapa posterior, o si completó. Necesitamos confirmar con ustedes **el orden canónico de las etapas**.

**Por qué importa:** es lo que convierte el gráfico actual (de alcance) en un embudo de verdad, embebible en el dashboard.

---

## 5. ✅ RESUELTO — el 14-15,6% de `(not set)` NO es un bug de `page_view`

**Respuesta de Germán (2026-08-17):** lo auditó a nivel de red en producción. El `page_view` **sí** se dispara bien — en la carga inicial (<1s tras el load) y en las navegaciones internas de la SPA (medición mejorada de GA4).

**Argumento que cierra el tema:** si el `page_view` inicial fallara de verdad, el % sería *mucho* más alto y el 84% restante tampoco tendría landing page. Que el 84% sí la tenga prueba que la carga inicial funciona.

**Qué explica el `(not set)`:** sesiones **reanudadas** (comportamiento conocido de GA4). Mucho tráfico es mobile desde WebViews (WhatsApp/Instagram). Cuando el usuario deja la pestaña en segundo plano y vuelve pasados los **30 min de timeout**, no hay recarga → GA4 abre una sesión nueva cuyo primer evento es `user_engagement`/`scroll`/`form_start` en vez de `page_view` → landing `(not set)`, **rebote ~94%, duración ~7s** (la firma exacta del segmento), y hereda la atribución orgánica de la visita original.

**Cómo validarlo (nosotros, read-only):** GA4 → Explorar → filtrar sesiones con landing `(not set)` → se ve `session_start` sin `page_view`, sesgo mobile y usuarios recurrentes.

**Ya accionó:** implementó re-disparo de `page_view` cuando el usuario retoma una sesión vencida (pestaña restaurada / retorno tras inactividad). **En producción desde 2026-08-17.** El % debería bajar en las próximas semanas; un residual de un dígito es normal en SPAs y no llega a cero. → **Follow-up:** re-chequear el % en ~2-3 semanas para confirmar que bajó.

**Implicancia para nuestra lectura (ojo en la reunión):** este mismo artefacto **infla el conteo de sesiones y ensucia el rebote/engagement/duración del tráfico paid** — que es justo WebView de IG/FB. O sea: parte de la "baja calidad" del paid (rebote 70%, duración 2:19) es artefacto de medición, no desinterés real. Para defender el diagnóstico del paid conviene apoyarse en señales **a prueba de denominador**: las conversaciones de Wizzo **cayeron a ~la mitad (94 vs 206)** aunque las sesiones subieron +139%, y 0 ventas web. Eso no lo explica ningún fantasma.

---

## 6. ⚠️ Eventos de e-commerce en GA4: no existen

**Qué vemos:** el GA4 de WizTrip tiene estos eventos:
`session_start`, `page_view`, `first_visit`, `user_engagement`, `scroll`, `wizzo_chat_opened`, `wizzo_intent_captured`, `form_start`, `wizzo_flight_card_shown`, `wizzo_hotel_card_shown`.

**No están** los eventos de e-commerce estándar:
- `view_quote` (o `view_item`)
- `add_to_cart`
- `begin_checkout`
- `checkout_abandoned`

**Consecuencia:** no se pueden armar el **embudo comercial**, la **serie de abandonos de checkout**, la **tasa de abandono de carrito** ni el **funnel por categoría de producto**. Quedaron fuera del dashboard a propósito.

**La pregunta:** ¿está previsto implementar el e-commerce de GA4 (con esos eventos)? ¿Hay fecha? Mientras tanto armamos el embudo con los eventos `wizzo_*`, que funcionan bien.

---

## 7. ℹ️ Las ventas de GA4: ¿son de prueba?

**Qué vemos:** GA4 reporta **$866 en ingresos, 2 transacciones y 1 solo producto** ("Vuelo a Santiago de Chile") en 28 días. El ticket promedio que manejamos para WizTrip ronda los **$2.900**.

**La pregunta:** ¿esas 2 transacciones son datos de prueba/testing, o son ventas reales? 

**Por qué importa:** todas las páginas que dependen de e-commerce (Funnel, Análisis de productos, Retención/LTV) están graficando esos números. Si son de prueba, hay que saberlo para no leerlos como negocio — o filtrarlos.
