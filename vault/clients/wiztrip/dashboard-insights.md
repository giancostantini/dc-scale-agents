# WizTrip · Insights del dashboard
### Documento de presentación — reunión lunes

> Hallazgos extraídos del dashboard de Looker Studio. Cada insight incluye **el dato**, **cómo se validó**
> y **qué implica**. Al final hay una sección de *qué NO podemos afirmar* — importante para no
> sobre-prometer si alguien repregunta.
>
> **Fuentes:** GA4 (WizTrip Production) · Search Console · PostgreSQL (analítica de Wizzo)
> **Períodos:** GA4/Postgres 27 jun – 24 jul 2026 · Search Console 12 jun – 9 jul 2026
> **Actualizado:** 2026-07-24

---

# 🎯 Resumen ejecutivo — los 3 titulares

### 1. El 84% de las visitas nunca abre Wizzo
De 758 personas que entraron al sitio, **615 se fueron sin tocar el chat**. La mayor fuga del negocio no está en el producto: está **en la puerta de entrada**.

### 2. WizTrip solo es visible por su propia marca
**62 clicks de búsquedas de marca. 0 clicks de búsquedas no-marca.** Quien ya nos conoce nos encuentra; quien busca un viaje sin conocernos, no. Todo el SEO está por hacerse.

### 3. Redes es el canal #1 — y está sub-medido
**Organic Social (30,6%) supera a Direct (30,1%) y a Organic Search (21,7%).** Y buena parte del "Direct" es tráfico de WhatsApp/Instagram que perdió su etiqueta. El peso real de redes es **mayor al que muestra el reporte**.

---

# 1 · El hallazgo principal: dónde se pierde la gente

Construimos **dos embudos en paralelo** —uno por visitas y otro por personas— justamente para poder defender el diagnóstico. **Ambos coinciden**, así que no es un artefacto de cómo medimos.

## Los números

| Escalón | Por visitas | Por personas |
|---|---|---|
| session_start | 1.214 (100%) | **758 (100%)** |
| wizzo_chat_opened | 197 (16,2%) | **143 (18,9%)** |
| wizzo_intent_captured | 94 (7,7%) | **72 (9,5%)** |
| form_start | 81 (6,7%) | **71 (9,4%)** |
| wizzo_flight_card_shown | 75 (6,2%) | **60 (7,9%)** |

## Los ratios paso a paso (el dato que importa)

| Paso | Por visitas | Por personas | Lectura |
|---|---|---|---|
| Sesión → abre chat | 16,2% | **18,9%** | 🔴 **La gran fuga** |
| Abre chat → intención | 47,7% | **50,3%** | 🔴 **La segunda fuga** |
| Intención → form | 86,2% | **98,6%** | ✅ No es fuga |
| Form → tarjeta vuelo | 92,6% | **84,5%** | ⚠️ Ver punto 1.4 |

## 1.1 · 🔴 615 personas se van sin abrir el chat

**El dato:** 758 personas entraron, 143 abrieron Wizzo. **81% se fue sin tocarlo.**

**Por qué importa:** Wizzo es el diferencial del producto. Cuatro de cada cinco visitas ni se enteran de que existe.

**Implicancia:** la palanca de mayor impacto **no es mejorar el chat, es hacerlo visible**. Cualquier mejora en el flujo interno afecta solo al 19% que ya entra.

## 1.2 · 🔴 La mitad abre el chat y no llega a pedir nada

**El dato:** de 143 personas que abrieron el chat, **72 llegaron a expresar una intención (50,3%)**. Las otras 71 lo abrieron y se fueron.

**Implicancia:** el problema está en **los primeros segundos de la conversación**. Puede ser el mensaje de apertura, el tiempo de respuesta, o que no quede claro qué se le puede pedir.

## 1.3 · ✅ Después de la intención, el flujo funciona (y esto corrige una lectura previa)

**El dato:** intención → form da **98,6% por personas**.

Medido **por visitas** daba 86,2%, y eso parecía una fuga del 14%. **No lo era.** Ese 14% eran **las mismas personas volviendo en otra visita** a arrancar el form.

**Por qué es importante para la reunión:** si solo mirábamos el embudo por sesiones, íbamos a proponer arreglar un paso que **no está roto**. Es la mejor evidencia de por qué se construyeron los dos embudos.

## 1.4 · ⚠️ Quien ve vuelos, vuelve a mirarlos: comportamiento de comparador

**El dato:** es el único paso que empeora al medirlo por personas (84,5% vs 92,6%). La explicación está en la densidad:

| Evento | Sesiones | Personas | Sesiones por persona |
|---|---|---|---|
| form_start | 81 | 71 | 1,14 |
| **wizzo_flight_card_shown** | 75 | **60** | **1,25** |

Las 75 sesiones que vieron tarjetas se concentran en **60 personas**: vuelven a mirar vuelos varias veces.

**Implicancia:** **no es un problema, es el patrón normal de la categoría.** La gente compara durante semanas antes de reservar (lead time promedio: **85 días**). Ahora está medido.

## 1.5 · Contexto: 1,6 visitas por persona

**1.214 sesiones / 758 personas = 1,60.** No es tráfico de una sola pasada; hay reincidencia real, consistente con el lead time de 85 días.

---

# 2 · Calidad del producto (Wizzo)

Datos de PostgreSQL — **206 conversaciones analizadas**.

## 2.1 · Solo el 15,53% de las conversaciones completa

De 206 conversaciones, **32 completaron** y **174 abandonaron**.

## 2.2 · 🔴 El 60% de los abandonos ocurre en una sola etapa: "opciones"

| Etapa de abandono | Conversaciones | % de los abandonos |
|---|---|---|
| **opciones** | **104** | **59,8%** |
| preferencias | 37 | 21,3% |
| selección | 31 | 17,8% |
| inicio | 2 | 1,1% |

**Implicancia:** el cuello de botella es **único y localizado**. Cuando Wizzo muestra las opciones, la mitad de la gente se va. Las tres causas candidatas: **precio, disponibilidad o relevancia** de lo que ofrece.

## 2.3 · Calidad del agente

| Métrica | Valor |
|---|---|
| Entendió la intención | **100,00%** 🚩 |
| Corregido por el usuario | 13,59% |
| Loops detectados | 11,17% |
| Escalado a humano | 3,40% |

**~1 de cada 4 conversaciones tiene fricción** (corregido + loops).

## 2.4 · 🚩 El dato del 100% no es confiable — y hay contradicción entre sistemas

Un flag que **nunca es falso no está midiendo nada**. Y dos sistemas independientes se contradicen:

| Fuente | Métrica | Valor |
|---|---|---|
| GA4 | `wizzo_intent_captured` / chats abiertos | **50,3%** |
| Postgres | `agent_understood_intent` | **100%** |

**GA4 dice que solo la mitad de los chats llega a capturar una intención. Postgres dice que el agente entendió el 100%.**

**Implicancia:** hasta aclararlo, **esa métrica no se puede usar para decidir**. Va como pregunta al equipo técnico.

> ✅ **Validación cruzada que sí cierra:** GA4 reporta **197 chats abiertos** y Postgres **206 conversaciones**. Están tan cerca que confirma que ambos sistemas miden lo mismo — lo que refuerza que la discrepancia del punto anterior es real y no un problema de fuentes distintas.

---

# 3 · Adquisición: de dónde viene la gente

Total del período: **~1.212 sesiones · 758 personas · 735 usuarios nuevos · 48,39% engagement**

## 3.1 · Redes es el canal #1

| Canal | % | Sesiones aprox. |
|---|---|---|
| **Organic Social** | **30,6%** | **~371** |
| Direct | 30,1% | 365 |
| Organic Search | 21,7% | 263 |
| Paid Social | 17,3% | ~210 |

**Implicancia:** el trabajo en redes **está funcionando** y es el principal motor de tráfico.

## 3.2 · El "Direct" está inflado — se está subestimando a redes

**Direct no significa "escribió la URL".** Significa que el navegador no informó el origen. Eso pasa con:
- **Links de WhatsApp** ← el canal más usado en Uruguay
- Instagram/Facebook abiertos desde la app
- Códigos QR y links en mails

**Implicancia:** una parte relevante de ese 30,1% es **tráfico social sin etiquetar**. El peso real de redes es mayor al reportado, y hoy **no se puede medir el retorno de Instagram/WhatsApp**.

**Acción concreta:** usar **UTMs** en todo link que se comparta.
```
wiz-trip.com/?utm_source=whatsapp&utm_medium=social&utm_campaign=promo-julio
```

## 3.3 · 🚩 Aparecen 210 sesiones de "Paid Social" sin campañas activas

**El dato:** 17,3% del tráfico está clasificado como **Paid Social**. En el período anterior (19 jun – 16 jul) **esa porción no existía**.

**Tres explicaciones posibles:**
1. Alguien promocionó un posteo y no está comunicado
2. Se comparten links con UTMs que dicen `paid`/`cpc` y GA4 los clasifica mal
3. Un error de etiquetado nuevo

**Implicancia:** si es (1), cambia toda la lectura del dashboard. **Hay que averiguarlo antes de presentar conclusiones sobre canales.**

---

# 4 · SEO: visibilidad solo por marca

Search Console, 12 jun – 9 jul: **83 clicks · 174 impresiones · 47,7% CTR · posición promedio 3,39**

## 4.1 · 🔴 Cero visibilidad no-marca

| | Clicks | CTR | Impresiones |
|---|---|---|---|
| **Branded** | 62 | 61,39% | 101 |
| **No branded** | **0** | 0% | 2 |

Top queries: `wiztrip` (61 clicks), `wizztrip`, `hola trip`, `world trip`, `wytrip` — **todas variantes de marca o errores de tipeo**.

**Implicancia:** el CTR de marca (61%) es excelente — quien nos busca, nos clickea. Pero **no estamos captando demanda nueva**. El SEO está en cero.

## 4.2 · El 78% del tráfico orgánico cae en la home

| Página de destino | Sesiones | % del orgánico |
|---|---|---|
| **`/` (home)** | **205** | **78%** |
| (not set) | 36 | 14% |
| /vuelos | 5 | 2% |
| /hoteles | 4 | 1,5% |

**Implicancia:** las páginas de producto **no rankean para nada**. Nadie busca "vuelos a Santiago" y llega a `/vuelos`. Confirma el punto 4.1 desde otro ángulo.

**Acción:** contenido y optimización por destino/ruta para que las landings capten demanda propia.

---

# 4.bis · 🎯 EL HALLAZGO CENTRAL — la conversión se cierra en WhatsApp, no en la web

*(Descubierto 2026-07-28 al mapear TODOS los eventos de GA4. Reemplaza la lectura anterior de "solo 2 convierten".)*

El embudo de Wizzo llega mucho más lejos de lo que mostrábamos. Los eventos completos:

| Paso del producto Wizzo | Evento GA4 | Sesiones |
|---|---|---|
| Abre el chat | `wizzo_chat_opened` | 189 |
| Expresa intención | `wizzo_intent_captured` | 86 |
| Ve opciones (vuelo/hotel) | `wizzo_flight_card_shown` / `wizzo_hotel_card_shown` | 70 / 47 |
| Selecciona | `wizzo_flight_selected` / `wizzo_hotel_selected` | 37 / 25 |
| **Llega al checkout** | **`wizzo_checkout_shown`** | **22** |
| **Se deriva a WhatsApp** | **`wizzo_derivation`** | **17** |
| **Compra en la web** | **`purchase`** | **2** |

**La conclusión que cambia todo:**

> **22 personas llegan al checkout con intención de reservar. 17 se derivan a WhatsApp. Solo 2 quedan registradas como venta web.**

- El "solo 2 convierten (0,26%)" era **una lectura equivocada por medición incompleta.** La intención de compra real es **~22**, no 2.
- El `purchase = 2` es tan bajo porque **la venta se cierra en WhatsApp**, fuera del alcance de GA4/Pixel/Windsor. Los **17 `wizzo_derivation`** lo prueban.
- **De ~22 con intención de compra, la web captura 2 = ~9%.** El otro ~90% se cierra donde no medimos.

**Frase para el slide:** *"El problema no es la demanda — reservó gente. El problema es que ~el 90% de nuestras conversiones se cierran en WhatsApp y no las medimos. La analítica solo vio 2 de ~22."*

Prueba definitiva de por qué instrumentar la conversión de WhatsApp es **prioridad #1**.

---

# 5 · ⚠️ Qué NO podemos afirmar (leer antes de la reunión)

Esto protege de repreguntas incómodas.

### 5.1 · No medimos la conversión real (se cierra en WhatsApp)
El `purchase` de la web da 2, pero **22 llegan al checkout y 17 se derivan a WhatsApp** (ver §4.bis). Podemos afirmar la **intención de compra** (~22); la **venta cerrada real** no la medimos porque ocurre en WhatsApp — es problema de instrumentación, no de demanda.

### 5.2 · Las ventas de GA4 son de prueba
**$866 · 2 transacciones · 1 solo producto** ("Vuelo a Santiago de Chile") en 28 días. El ticket real de una OTA ronda los **$2.900**.

**No usar para decisiones** ningún número de: Ingresos, Compras, Ticket Promedio, Tasa de Conversión, Top Productos, ni la dona de ingresos por canal.

> ⚠️ **Cuidado especial con la dona de "Ingresos por canal"**: muestra Direct 50,8% / Organic 49,2%, que **parece** un mix balanceado de canales. En realidad **son 2 ventas, una de cada canal**. Con la venta #3 se rompe. No presentarla como patrón.

### 5.3 · El 14% de `(not set)` en landing pages ya está explicado (no es un bug)
36 de 263 sesiones orgánicas aparecen como `(not set)`. **Resuelto por Germán (2026-08-17):** no es que el `page_view` inicial falle — son **sesiones reanudadas** de WebView mobile (WhatsApp/Instagram). Cuando el usuario vuelve a una pestaña de fondo pasados los 30 min de timeout, GA4 abre sesión nueva sin `page_view` → landing `(not set)`, rebote ~94%, ~7s. Ya implementó un re-disparo de `page_view` al reanudar; el % baja en las próximas semanas (un residual de un dígito es normal en SPAs). **Consecuencia:** el dato del 84% restante es confiable; y ojo, estas sesiones-fantasma inflan el conteo y el rebote del tráfico WebView/paid.

### 5.4 · Los embudos no validan secuencia
Looker Studio cuenta cada evento por separado; **no verifica que la misma persona hizo A y después B**. Para un embudo con validación de orden hay que usar **GA4 → Explorar → Exploración de embudo**.

---

# 6 · Preguntas abiertas para el equipo técnico

Detalle completo en [`looker-dashboard-sql-handoff.md`](looker-dashboard-sql-handoff.md).

| # | Pregunta | Prioridad |
|---|---|---|
| 1 | Crear las 4 vistas SQL (UNNEST) → sin ellas no sabemos **por qué** abandonan | 🔴 Bloqueante |
| 2 | ¿`agent_understood_intent` se calcula de verdad? Da 100% siempre | 🚩 Alta |
| 3 | ¿Existe o va a existir un **evento de conversión** en GA4? | 🚩 Alta |
| 4 | ¿De dónde salen las 210 sesiones de "Paid Social"? | 🚩 Alta |
| 5 | ¿Se van a implementar los eventos de e-commerce? | ⚠️ Media |
| 6 | ¿Las 2 transacciones son de prueba? | ⚠️ Media |
| 7 | ¿El `page_view` se dispara bien en la carga inicial? (14% `not set`) | ⚠️ Media |

---

# Anexo · Metodología (por si preguntan)

**Por qué dos embudos.** Medir por *sesiones* responde "¿en cuántas visitas pasó X?"; medir por *usuarios* responde "¿cuántas personas llegaron a X?". Con un lead time de 85 días, la gente completa su recorrido **a lo largo de varias visitas**, y el embudo por sesiones lo muestra como abandono. Construir los dos permitió **distinguir fuga real de recorrido partido** — y así descubrimos que el paso intención→form no estaba roto (98,6% por personas).

**Validaciones cruzadas que dan confianza en los datos:**

| Chequeo | Resultado |
|---|---|
| Total sesiones del embudo (1.214) vs. reconstrucción de la dona de canales (~1.212) | ✅ Coinciden |
| Usuarios totales del embudo (758) vs. usuarios nuevos de Tráfico (735) | ✅ Coherente |
| `(direct)/(none)` en tabla Fuente/Medio (365) vs. KPI Sesiones Directas (365) | ✅ Exacto |
| GA4 chats abiertos (197) vs. Postgres conversaciones (206) | ✅ Coinciden |
| Suma de abandonos + completadas (174 + 32) vs. total conversaciones (206) | ✅ Exacto |

**Correcciones aplicadas al dashboard durante el análisis** (por si preguntan por qué los números cambiaron): se repararon KPIs mal mapeados en Tráfico, se corrigió la tabla "Fuente/Medio" que usaba una dimensión de *atribución* (mostraba 2 sesiones en vez de 1.212), se curó el embudo para que muestre el flujo real de Wizzo, y se agregaron las métricas de calidad del agente.
