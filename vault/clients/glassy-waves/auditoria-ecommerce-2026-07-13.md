# Auditoría integral de Glassy Waves

**Fecha del análisis:** 2026-07-13
**Sitio auditado:** https://glassywaves.com.uy/
**Plataforma confirmada:** Fenicio eCommerce (Uruguay) + capa de personalización GoPersonal (evidencia: logs de consola `[gopersonal] installing fenicio scripts`; footer "Fenicio eCommerce Uruguay"; CDN de medios `f.fcdn.app`).
**Mercados declarados:** Uruguay (principal) + Argentina.
**Consultor:** D&C Scale Partners — auditoría de e-commerce / CRO / SEO / competitiva.

> **Nota de método (regla "no inventar"):** todas las observaciones marcadas como *verificadas* provienen de navegación real del sitio el 2026-07-13 (DOM leído en vivo, texto citado y valores computados vía JS de solo lectura) o de las páginas de política citadas. Las *hipótesis* están rotuladas como tales y requieren datos internos para confirmarse. Las capturas de pantalla no pudieron generarse por *time-outs del renderizador* del entorno de captura (limitación de la herramienta, no un defecto del sitio); en su lugar se citan URLs exactas, texto del DOM y mediciones computadas como evidencia.

---

## 1. Resumen ejecutivo

### Estado general
Glassy Waves es una tienda **funcional, con identidad de marca fuerte y una base técnica decente sobre Fenicio**, pero **sub-optimizada para conversión**. La marca comunica bien "quién es" (surf, comunidad, juventud uruguaya), pero la tienda comunica mal "por qué comprar acá y ahora": las fichas de producto están casi vacías de contenido persuasivo, el sistema de precios muestra 3–4 números sin explicar, el buscador no perdona errores de tipeo y termina en callejones sin salida, no hay reseñas ni prueba social, no hay umbral de envío gratis, y la política de "no devolvemos dinero" introduce fricción y riesgo. Nada de esto bloquea técnicamente la compra, pero todo junto **deja conversión, ticket y recompra sobre la mesa**.

### Cinco fortalezas (verificadas)
1. **Identidad de marca y nicho claros.** Voz propia e irreverente ("Descubrí las malditas mejores nuevas prendas"), estética surf coherente, comunidad real (surf camps, blog, cápsula x Origen). Difícil de copiar por multimarca o marcas globales.
2. **Checkout razonablemente completo para Fenicio.** Progreso en 3 pasos (facturación → envío → pago), edición de cantidad, quitar ítem, **campo de cupón**, **cambio de moneda a USD**, campo de observaciones y **upsell de bolsa de tela**. (URL: `/mi-compra`.)
3. **Omnicanalidad y pagos locales.** Varias tiendas físicas + retiro gratis, WhatsApp con horarios visibles, y amplitud de medios de pago locales (OCA, Abitab, Redpagos, Líder, Cabal, Visa/Master/Diners) vía Mercado Pago.
4. **Base técnica sólida en lo básico.** Imágenes WebP con `alt` casi completo y lazy-load correcto, 404 con status real, `robots.txt`/sitemap presentes, URLs legibles, y **barra de compra fija (sticky add-to-cart) + WhatsApp flotante en móvil**.
5. **Merchandising con ganchos.** Etiquetas "Preventa", secciones "New In / New Drop / Shop de Look", cross-sell ("Productos que te pueden interesar") y "Últimos productos vistos".

### Diez oportunidades principales
1. **Enriquecer la ficha de producto** (descripción, materiales, calce, cuidado, beneficios) — hoy están prácticamente vacías.
2. **Clarificar el sistema de precios** (3–4 números sin etiqueta en listados) con jerarquía y rótulos.
3. **Arreglar el buscador**: tolerancia a errores + página de "sin resultados" con recuperación (sugerencias, productos, categorías).
4. **Agregar prueba social**: reseñas/valoraciones y contenido generado por usuarios (UGC) de la comunidad.
5. **Introducir un umbral de envío gratis** (o beneficio equivalente) para subir ticket y reducir el shock del costo de envío.
6. **Revisar la política de devoluciones** ("no devolvemos dinero") por riesgo legal/confianza y su comunicación.
7. **Mejorar filtros y ordenamiento** en listados (hoy solo filtro por precio, sin orden ni talle/color visibles).
8. **Captación de leads + flujos de ciclo de vida** (pop-up de email con incentivo, carrito abandonado, postcompra, reseñas).
9. **Higiene SEO técnica**: H1 en home, metadatos de categoría/producto, datos estructurados JSON-LD, control de URLs facetadas.
10. **Accesibilidad y confianza**: habilitar zoom en móvil, agrandar áreas táctiles, unificar identidad de contacto (email de marca, RUT).

### Tres problemas críticos
1. **Fichas de producto sin contenido.** El PDP no tiene descripción, materiales, cuidado ni beneficios (ej. `/catalogo/hoodie-original-negro_H98_u`). Es el punto de decisión y está vacío → afecta directamente conversión y SEO.
2. **Buscador que castiga y no recupera.** Un typo de una letra ("remra" vs "remera") devuelve **0 resultados** en una página sin salida. El buscador es de altísima intención de compra.
3. **Política de "no devoluciones de dinero" + baja confianza formal.** Combinada con emails @gmail y ausencia de RUT/identidad societaria, eleva la ansiedad de compra y expone a fricción legal (venta a distancia en Uruguay).

### Mayor ventaja competitiva potencial
**La comunidad y el contenido de marca como foso (moat).** Ni los multimarca (La Isla, Flesh) ni las marcas globales (Rip Curl, Quiksilver) pueden replicar "marca de/por jóvenes surfers uruguayos con surf camps y comunidad". Convertir esa comunidad en **programa de fidelización + UGC + captación de leads** es el mayor diferenciador sostenible, y hoy está prácticamente sin explotar en la tienda.

### Mayor riesgo detectado
**Comoditización por conversión pobre frente a competidores mejor optimizados y mejor financiados.** Rusty (mismo modelo, misma plataforma) y La Isla (breadth + financiación) compiten por el mismo cliente con mejores mecánicas comerciales (2da unidad, cuotas sin interés, envío gratis), y Mercado Libre fija expectativas de precio/logística. Si Glassy Waves no cierra las brechas de ficha, precio, prueba social y envío, su tráfico convierte peor y su ticket queda por debajo del potencial.

### Valoración general: **58 / 100**

**Criterio de puntuación** (ponderado sobre 7 dimensiones, evidencia verificada):

| Dimensión | Nota | Comentario |
|---|---|---|
| Marca y propuesta de valor | 7/10 | Identidad fuerte; falta traducirla a argumentos de compra en la tienda |
| Ficha de producto / conversión | 4/10 | Sin descripción, sin reseñas, precios confusos |
| Navegación y buscador | 5/10 | Mega-menú ok; filtros pobres; buscador sin tolerancia ni recuperación |
| Confianza y servicio | 5/10 | WhatsApp/omnicanal bien; no-devoluciones, Gmail, sin RUT restan |
| Experiencia móvil | 5/10 | Sticky ATC bien; zoom bloqueado y targets chicos |
| SEO / técnico | 6/10 | WebP/404/sitemap ok; sin H1 home, sin JSON-LD, index bloat facetado |
| Retención / ciclo de vida | 4/10 | Sin captación de leads ni flujos postventa visibles |

El 58 refleja un **e-commerce sano en lo estructural pero flojo en lo que mueve la aguja comercial** (conversión, ticket, recompra). La mayoría de las brechas son **corregibles y de alto ROI**, varias como quick wins.

---

## 2. Metodología y alcance

**Fecha:** 2026-07-13. **Analista:** consultoría D&C Scale Partners (navegación pública, solo lectura).

**Páginas y flujos revisados (verificado):**
- Home: `https://glassywaves.com.uy/`
- Categoría/listado: `/vestimenta` (117 productos), catálogo general `/catalogo` (163), `/catalogo?q=remera` (39)
- Subcategorías del mega-menú: `/vestimenta/remeras`, `/musculosas`, `/tops`, `/camperas`, `/buzos`, `/pantalones`, `/hoodies`, `/shorts`; `/accesorios`, `/gorras`, `/calzado`, `/catalogo/bikinis`, `/catalogo?grp=21` (House of Marley), `/catalogo?grp=25` (New In), `/catalogo?grp=14` (New Drop)
- Ficha de producto: `/catalogo/hoodie-original-negro_H98_u`
- Carrito/checkout inicio: `/mi-compra` (identificación; **no se completó pago ni se ingresaron datos personales**)
- Buscador: pruebas `q=remera` (exacto/variante), `q=remra` (typo), `q=neoprene`/`keywords=` (parámetro inválido)
- Políticas: `/envios-y-devoluciones`, `/preguntas-frecuentes`, `/como-comprar`, `/condiciones-de-compra`, `/nosotros`
- Técnico: `robots.txt`, `sitemap`, títulos/meta/H1, microdata, `viewport`, tiempos de navegación (una muestra)

**Dispositivos / tamaños:** Escritorio 1280×720 y móvil 375×812 (viewport real redimensionado). Mediciones de áreas táctiles y tipografía computadas vía JS en 375px.

**Herramientas:** navegador headless (lectura de DOM/`read_page`/`get_page_text`, JS de inspección de solo lectura), extracción de texto de políticas, investigación de mercado/competencia vía búsqueda web y navegación de sitios de competidores.

**Limitaciones y elementos no verificables:**
- **Capturas de pantalla:** no generadas por time-outs del renderizador del entorno. Evidencia sustituida por texto del DOM + valores computados.
- **Peso en bytes de imágenes / Core Web Vitals (LCP, CLS, INP):** no medibles con fiabilidad (el CDN `f.fcdn.app` no envía `Timing-Allow-Origin`; no se corrió Lighthouse/PageSpeed). Los comentarios de rendimiento son **cualitativos y de una sola muestra**, no mediciones oficiales.
- **Cuotas sin interés:** no se muestran antes del pago; su disponibilidad real depende de la config de Mercado Pago y no se verificó el paso final de pago.
- **Comportamiento específico para Argentina** (precios ARS, impuestos, envíos): no se observó localización AR; el sitio opera en UYU (con toggle a USD en checkout).
- **Analítica interna** (tráfico, conversión, abandono, búsquedas internas, stock): no disponible públicamente — ver Sección 17.
- **Datos de competidores:** tomados de sus sitios públicos al 2026-07-13; precios ARS/UYU son volátiles.

---

## 3. Comprensión del negocio y del cliente

**Propuesta de valor (percibida).** Marca uruguaya *propia* (no multimarca) de ropa y accesorios surf/lifestyle, nacida de y para una comunidad joven de surfers. Cita de `/nosotros`: "Detrás de esta marca de ropa se desarrolla una comunidad de miles de jóvenes que fomentan y apoyan la cultura del surf". Vende estilo de vida, pertenencia e identidad, no solo prendas.

**Público objetivo aparente.** Jóvenes (aprox. 15–30) de Uruguay vinculados al surf y a la cultura de playa/skate; sensibles a marca, comunidad y estética; compradores mobile-first; posiblemente turistas en Punta del Este (de ahí el toggle a USD y la tienda en La Barra).

**Categorías y líneas de producto.** Vestimenta (Remeras/Musculosas/Tops, Camperas, Buzos, Hoodies, Pantalones, Shorts), Accesorios, Gorras, Calzado (championes, sandalias, zuecos, chancletas), Bikinis, y una cápsula de audio licenciada **House of Marley**. Ejes de merchandising: **New In**, **New Drop**, **Invierno**, **Preventa**, cápsula de sostenibilidad **x Origen**.

**Rango de precios (UYU, verificado en listados).** Desde ~$690 (musculosa) / $693–990 (chancletas) hasta ~$5.990 (zuecos de cuero). Núcleo de indumentaria: remerones $1.190–1.490, hoodies/buzos $1.758–2.990, camperas $1.890–4.390. Posicionamiento de **precio medio** para indumentaria uruguaya.

**Diferenciadores de marca.** Comunidad + contenido (surf camps, blog, lookbooks), producto propio, sostenibilidad (x Origen), omnicanalidad física, y una voz de marca desenfadada.

**Posicionamiento percibido.** "La marca surf joven uruguaya con comunidad", entre la marca aspiracional global (Rip Curl/Quiksilver) y el multimarca local (La Isla/Flesh); comparable casi 1:1 con **Rusty Uruguay**.

**Mercados atendidos.** Uruguay (todo el país + tiendas físicas). Argentina declarada como mercado, pero **sin localización visible** (precios UYU, sin hreflang, sin envío/impuestos AR); el toggle a USD cubre parcialmente al comprador extranjero.

**Políticas (verificadas en páginas citadas):**
- *Envíos* (`/envios-y-devoluciones`): "Enviamos nuestros productos a todo el país". DAC (el cliente paga al recibir), SoyDelivery/Correo Uruguayo (paga con la compra; en PDP: $259 normal, $200 en compras > $6.000), y **retiro gratis en local**. Tracking por email. Plazo 2–7 días hábiles (`/condiciones-de-compra`).
- *Cambios/Devoluciones*: "**No hacemos devoluciones de dinero, pero sí cambios por otros productos**". Ventana de **45 días** (FAQ), producto sin uso con etiquetas; el cliente paga el envío del cambio.
- *Pagos*: Visa, Mastercard, Diners, Líder, Cabal, Redpagos, Abitab, OCA — procesados vía **Mercado Pago** (FAQ #5: "transacciones a través de la plataforma segura Mercado Pago"). Descuentos **BBVA 20%** y **BBVA 30%** (Infinite/Black/Platinum).
- *Cuenta*: se requiere identificación por email (código OTP) o Google para comprar; **no hay compra como invitado**.

**Principales argumentos de compra.** Marca/comunidad; novedades frecuentes (drops); descuentos BBVA; omnicanal con retiro gratis; medios de pago locales; WhatsApp.

**Posibles objeciones del cliente.** "¿Me va a quedar bien?" (sin descripción/calce/reseñas), "¿qué precio pago realmente?" (multi-precio), "¿y si no me gusta?" (no hay devolución de dinero), "¿cuánto sale el envío?" (sin envío gratis), "¿es confiable?" (Gmail, sin RUT, sin reseñas).

**Modelo promocional y comercial.** Descuentos por tarjeta bancaria (BBVA) como mecánica dominante + liquidaciones (precios tachados) + preventas. **No se observaron** cuotas sin interés destacadas, umbral de envío gratis, ni 2da unidad (mecánicas habituales en la competencia).

**Estacionalidad probable.** Fuerte estacionalidad de verano austral (dic–feb) y pico turístico en Punta del Este; invierno con línea de camperas/buzos (hay eje "Invierno"). Tentpoles de e-commerce regionales: Ciberlunes UY, Hot Sale/Cyber Monday AR.

---

## 4. Mapa del recorrido de compra

| Etapa | Qué ocurre hoy (verificado) | Fricción / oportunidad |
|---|---|---|
| **1. Descubrimiento** | Home con hero-slider, "New In/New Drop/Shop de Look", recomendados y blog. Probable llegada por Instagram, tiendas físicas y marca. | SEO no capta demanda genérica (sin H1 en home, contenido de categoría pobre). Blog con notas de **2022** en portada resta frescura. |
| **2. Navegación** | Mega-menú con subcategorías; listados "Mostrando 12 de 117" + "Ver más"; **único filtro: precio**; sin ordenamiento. | Falta filtrar por talle/color y ordenar (relevancia/precio/novedad). Descubrimiento lento en catálogos grandes. |
| **3. Evaluación (PDP)** | Nombre, galería WebP, talles (radios), guía de talles (popup), precio multinivel BBVA, tabla de envío, cross-sell. **Sin descripción/materiales/cuidado/reseñas/cuotas.** | Punto de decisión vacío. Máxima oportunidad de conversión y ticket. |
| **4. Agregado al carrito** | "Comprar" con validación de talle ("Debes seleccionar un talle"); popup de confirmación con cross-sell ("Continuar en el sitio" / "Finalizar la compra"). | Buen patrón. Se puede reforzar cross-sell/bundles y barra de progreso a envío gratis. |
| **5. Inicio de checkout** | `/mi-compra` → "Identificate": email + **código OTP de 6 dígitos** o Google. **Sin invitado.** Resumen con cupón, moneda USD, observaciones, upsell bolsa, reCAPTCHA. | El OTP obliga a salir a la casilla de correo antes de avanzar → fricción para primer comprador. |
| **6. Pago** | 3 pasos (facturación → envío → pago) vía Mercado Pago (medios locales). | Cuotas no visibles antes del pago; costo de envío sin umbral gratis. |
| **7. Posventa y recompra** | Email de confirmación + tracking; cambios por WhatsApp. | **Sin** solicitud de reseña, sin flujo de bienvenida/carrito abandonado visible, sin programa de fidelidad ni recompra. |

---

## 5. Hallazgos por área

> Prioridad orientativa = (Impacto × Confianza × Urgencia) ÷ Esfuerzo, escala 1–5. **No es una predicción financiera.**

### H1 — La propuesta de valor no se traduce en argumentos de compra
- **Área:** A. Propuesta de valor y comunicación
- **Página o URL:** `https://glassywaves.com.uy/` (home)
- **Evidencia observada:** El hero comunica actitud de marca ("New in | Descubrí las malditas mejores nuevas prendas") pero **no** hay una franja de beneficios/razones para comprar (envíos, cambios, medios de pago, comunidad) above-the-fold; no hay copy que responda "por qué comprar acá".
- **Tipo:** Hipótesis (basada en estructura observada; falta validar con mapas de calor/scroll).
- **Problema:** La marca vende identidad pero no gestiona objeciones ni comunica ventajas funcionales en el primer impacto.
- **Impacto comercial:** El visitante nuevo no encuentra motivos rápidos de confianza/beneficio → menor conversión de tráfico frío.
- **Recomendación:** Añadir una **barra de beneficios** (retiro gratis en locales, cambios en 45 días, pagos locales/BBVA, WhatsApp) + un bloque corto "por qué Glassy Waves" (comunidad/producto propio).
- **Resultado esperado:** Mayor conversión de sesiones nuevas y menor rebote en home.
- **Métrica:** CVR de nuevos, scroll depth, clics a categoría.
- **Prioridad:** 20 · **Impacto:** 4 · **Esfuerzo:** 2 · **Confianza:** 4 · **Urgencia:** 2,5
- **Tipo de implementación:** Cambio de diseño/front-end + contenido.
- **Dependencia de Fenicio:** Bloques de home suelen ser configurables/tematizables (validar con plantilla).
- **Ejemplo de solución:** Franja de 4 íconos + microcopy bajo el hero, replicada como trust-bar en PDP y checkout.

### H2 — Blog desactualizado en home (notas de 2022)
- **Área:** B. Página de inicio / Contenido
- **Página o URL:** `https://glassywaves.com.uy/` (sección blog en portada) y `/blog`
- **Evidencia observada:** En portada conviven notas recientes ("18 FEB 2026 Glassy Waves x Origen", "06 FEB 2026 nuevo local La Barra") con **notas de 18/17/16 JUN 2022** ("Surf Camp Experience", "Las tablas de surf", "Glassy Waves por el mundo").
- **Tipo:** Observación verificada.
- **Problema:** Mezcla de contenido fresco y de hace 4 años transmite abandono editorial.
- **Impacto comercial:** Resta credibilidad y desperdicia el contenido como motor SEO/comunidad.
- **Recomendación:** Curar la portada a las últimas 3–4 notas; despublicar o actualizar las de 2022; establecer cadencia editorial.
- **Resultado esperado:** Percepción de marca activa; base para SEO informativo.
- **Métrica:** Tráfico orgánico a `/blog`, tiempo en página, asistencia a conversión.
- **Prioridad:** 20 · **Impacto:** 2 · **Esfuerzo:** 1 · **Confianza:** 5 · **Urgencia:** 2
- **Tipo de implementación:** Cambio operativo/de contenido.
- **Dependencia de Fenicio:** Gestión de blog nativa (configurable).
- **Ejemplo de solución:** Mostrar solo posts con fecha < 12 meses; redirigir/actualizar los antiguos con contenido evergreen.

### H3 — Buscador sin tolerancia a errores y con "sin resultados" en callejón sin salida
- **Área:** C. Buscador interno
- **Página o URL:** `https://glassywaves.com.uy/catalogo?q=remra` (typo) vs `?q=remera`
- **Evidencia observada:** `q=remera` → **39 resultados** relevantes (remerones/musculosas). `q=remra` (una letra de diferencia) → "**¡Lo sentimos! No hay productos en esta sección.**" **sin** "quisiste decir", **sin** productos sugeridos, **sin** accesos a categorías.
- **Tipo:** Observación verificada.
- **Problema:** El buscador (alta intención de compra) no perdona typos ni ofrece recuperación; la página de cero resultados es un final muerto.
- **Impacto comercial:** Búsquedas fallidas = abandono directo de usuarios listos para comprar.
- **Recomendación:** Activar tolerancia a errores/sinónimos si Fenicio lo permite; rediseñar la página de "sin resultados" con sugerencias, categorías populares, productos destacados y CTA a WhatsApp.
- **Resultado esperado:** Menos salidas tras búsqueda, más conversión asistida por búsqueda.
- **Métrica:** % búsquedas sin resultados, CVR de sesiones con búsqueda, salidas desde `/catalogo?q=`.
- **Prioridad:** 26,7 · **Impacto:** 4 · **Esfuerzo:** 3 · **Confianza:** 5 · **Urgencia:** 4
- **Tipo de implementación:** Configuración Fenicio (fuzzy/sinónimos, *validar con soporte*) + cambio de diseño de la plantilla de cero resultados.
- **Dependencia de Fenicio:** Alta (motor de búsqueda). Requiere validación con soporte/partner.
- **Ejemplo de solución:** Página de "sin resultados" con: "¿Quisiste decir…?", grilla de "más vendidos", chips de categorías y botón de WhatsApp.

### H4 — Filtros pobres y sin ordenamiento en listados
- **Área:** C/D. Navegación, categorías y listados
- **Página o URL:** `https://glassywaves.com.uy/vestimenta` (117 productos), `/catalogo` (163)
- **Evidencia observada:** El único control de filtro visible es **rango de precio** (inputs "Desde/Hasta"). **No** se exponen filtros de talle/color ni **ningún control de ordenamiento** (relevancia, precio, novedad). Existen URLs facetadas por color/marca (`?color=`, `?marca=`) pero no como controles visibles en el listado.
- **Tipo:** Observación verificada.
- **Problema:** En catálogos de 100+ ítems, sin filtrar por talle/color ni ordenar, el usuario debe paginar con "Ver más" (12 por tanda).
- **Impacto comercial:** Descubrimiento lento → menos productos vistos, menor probabilidad de encontrar el ítem correcto, más abandono.
- **Recomendación:** Exponer filtros de **talle, color y categoría** y un **selector de orden**; considerar mostrar subcategorías como chips.
- **Resultado esperado:** Más PDP vistas por sesión, mejor tasa de "agregado al carrito".
- **Métrica:** Productos vistos/sesión, uso de filtros, CVR de listados.
- **Prioridad:** 24 · **Impacto:** 4 · **Esfuerzo:** 3 · **Confianza:** 4 · **Urgencia:** 4,5
- **Tipo de implementación:** Configuración Fenicio (filtros facetados) + front-end. *Validar alcance con Fenicio.*
- **Dependencia de Fenicio:** Media/Alta (depende de si los facets están habilitables en la plantilla).
- **Ejemplo de solución:** Barra de filtros lateral (talle/color/precio) + dropdown "Ordenar por" (Novedades / Precio ↑↓ / Más vendidos).

### H5 — Precios apilados sin etiquetas en tarjetas y home (3–4 números)
- **Área:** D. Listados / H. CRO (anclaje y claridad)
- **Página o URL:** `https://glassywaves.com.uy/vestimenta`, home, PDP
- **Evidencia observada:** Las tarjetas muestran hasta **cuatro números** sin rótulo, p. ej. "Hoodie Original / Negro $1.758 $2.790 $1.231 $1.406". En la **PDP** esos números **sí** están etiquetados: $1.758 (venta), $2.790 (tachado), "BBVA INFINITE/BLACK/PLATINUM 30" → $1.231, "BBVA 20% OFF" → $1.406. En listados/home aparecen **sin** etiqueta.
- **Tipo:** Observación verificada.
- **Problema:** El comprador no sabe "cuál precio pago". La ambigüedad genera ansiedad y desconfianza, y diluye el ancla del descuento.
- **Impacto comercial:** Menor claridad → menor conversión; el beneficio BBVA (potente) se percibe como ruido en vez de ventaja.
- **Recomendación:** En tarjetas, mostrar **precio de venta + precio tachado + % OFF** con jerarquía clara y una etiqueta compacta "Precio BBVA desde $X" (no 4 números crudos). Mantener el detalle etiquetado en PDP.
- **Resultado esperado:** Mejor comprensión de precio, mayor CTR a PDP y conversión.
- **Métrica:** CTR tarjeta→PDP, CVR, tests de comprensión (encuesta).
- **Prioridad:** 32 · **Impacto:** 4 · **Esfuerzo:** 2 · **Confianza:** 4 · **Urgencia:** 4
- **Tipo de implementación:** Cambio de diseño/front-end de la tarjeta de producto.
- **Dependencia de Fenicio:** Media (maquetado de la card en plantilla).
- **Ejemplo de solución:** `$1.758` grande + `$2.790` tachado + chip "−37%"; línea secundaria "BBVA hasta 30% OFF → $1.231".

### H6 — Ficha de producto sin descripción, materiales, calce ni cuidado (CRÍTICO)
- **Área:** E. Fichas de producto
- **Página o URL:** `https://glassywaves.com.uy/catalogo/hoodie-original-negro_H98_u`
- **Evidencia observada:** El PDP contiene: nombre, código "H98-u", galería, precio (multinivel), selector de talle, guía de talles, cantidad, "Comprar", tabla de envío y cross-sell. **No hay** bloque de descripción, materiales/composición, instrucciones de cuidado, ni beneficios/uso. Confirmado leyendo el DOM completo de la ficha.
- **Tipo:** Observación verificada.
- **Problema:** El punto exacto donde se decide la compra no ofrece la información que reduce la incertidumbre (calce, tela, uso, cuidado).
- **Impacto comercial:** Baja conversión, más consultas por WhatsApp, más cambios/insatisfacción por expectativas erróneas, y **contenido delgado para SEO**.
- **Recomendación:** Plantilla de PDP con **descripción, composición/material, calce (regular/oversize), cuidado, y 2–3 bullets de beneficio**; poblar al menos el top 50 de productos.
- **Resultado esperado:** ↑ conversión de PDP, ↓ consultas y cambios, ↑ ranking orgánico de fichas.
- **Métrica:** CVR de PDP, tasa de add-to-cart, cambios/devoluciones, orgánico a `/catalogo/*`.
- **Prioridad:** 33,3 · **Impacto:** 5 · **Esfuerzo:** 3 · **Confianza:** 5 · **Urgencia:** 4
- **Tipo de implementación:** Cambio operativo/de contenido (redacción) sobre campo de descripción de Fenicio.
- **Dependencia de Fenicio:** Baja (Fenicio tiene campo de descripción; es carga de contenido).
- **Ejemplo de solución:** Estructura fija: *Descripción* (2–3 líneas con voz de marca) · *Material* · *Calce* · *Cuidado* · *Incluye/uso*. Reutilizable como plantilla del equipo.

### H7 — Sin reseñas ni prueba social en producto
- **Área:** E/H/K. Prueba social
- **Página o URL:** PDP (`/catalogo/hoodie-original-negro_H98_u`) y listados
- **Evidencia observada:** No hay valoraciones, estrellas, reseñas, contadores de ventas/vistas ni UGC en PDP ni en tarjetas. En microdata, `AggregateRating` está ausente.
- **Tipo:** Observación verificada.
- **Problema:** Falta el principal reductor de incertidumbre en moda online.
- **Impacto comercial:** Menor conversión y menor confianza; se pierde contenido fresco y señales de rich-result en Google.
- **Recomendación:** Integrar reseñas con fotos (post-compra) vía app externa (p. ej. tipo Judge.me/Loox) o solución equivalente compatible con Fenicio; mostrar estrellas en tarjetas y PDP.
- **Resultado esperado:** ↑ conversión, ↑ confianza, ↑ CTR orgánico (estrellas en SERP).
- **Métrica:** CVR con vs sin reseña, nº reseñas, uplift de tráfico orgánico.
- **Prioridad:** 16 · **Impacto:** 4 · **Esfuerzo:** 3 · **Confianza:** 4 · **Urgencia:** 3
- **Tipo de implementación:** Integración con herramienta externa (+ posible desarrollo de inserción en plantilla). *Validar compatibilidad con Fenicio.*
- **Dependencia de Fenicio:** Media/Alta (integración y render en PDP).
- **Ejemplo de solución:** Email postcompra pidiendo reseña + foto; widget de estrellas en PDP y grilla.

### H8 — Talles no disponibles ocultos (sin manejo visible de "sin stock" por talle)
- **Área:** E. Variantes / disponibilidad
- **Página o URL:** `https://glassywaves.com.uy/catalogo/hoodie-original-negro_H98_u`
- **Evidencia observada:** El selector muestra solo **XS, S, M** (radios `1:H98:u:xs`, `…:s`, `…:m`). No aparecen L/XL ni como opción deshabilitada/"sin stock". Hay validación "Debes seleccionar un talle".
- **Tipo:** Observación verificada (que L/XL existan y estén agotados es **hipótesis** a validar con catálogo interno).
- **Problema:** Si un talle está agotado y simplemente se oculta, el usuario no puede pedir aviso de reposición ni entiende la disponibilidad; si nunca existió, no hay problema.
- **Impacto comercial:** Se pierde demanda capturable (waitlist) y señales de qué talles reponer.
- **Recomendación:** Mostrar talles agotados como **deshabilitados** con "Avisame cuando vuelva" (captura de email); revisar profundidad de talles del top de ventas.
- **Resultado esperado:** Captura de demanda insatisfecha, mejores decisiones de reposición.
- **Métrica:** Altas de waitlist, ventas por reposición, % PDP con talles agotados.
- **Prioridad:** 12 · **Impacto:** 3 · **Esfuerzo:** 3 · **Confianza:** 3 · **Urgencia:** 4
- **Tipo de implementación:** Configuración Fenicio (mostrar agotados) + integración de "avisame" (externa). *Validar con Fenicio.*
- **Dependencia de Fenicio:** Media/Alta.
- **Ejemplo de solución:** Talle en gris tachado + modal de captura de email para restock.

### H9 — Cuotas y medios de pago no visibles en la ficha
- **Área:** E/F. Precio / financiación
- **Página o URL:** PDP y `/condiciones-de-compra`
- **Evidencia observada:** El PDP muestra descuentos BBVA pero **no** informa cuotas ni el resto de medios (OCA/Abitab/Redpagos/Líder/Cabal/Mercado Pago). Los pagos se procesan por Mercado Pago (FAQ #5). En la competencia AR las **cuotas sin interés** son argumento central.
- **Tipo:** Observación verificada (existencia de cuotas concretas = hipótesis, depende de config de Mercado Pago).
- **Problema:** No comunicar financiación/medios en el momento de decisión reduce el atractivo del precio.
- **Impacto comercial:** Menor conversión, especialmente en tickets altos (camperas $3.990–4.390) y en comprador argentino.
- **Recomendación:** Mostrar en PDP "Hasta N cuotas sin interés" (si aplica) y los logos de medios; validar cuotas reales con Mercado Pago.
- **Resultado esperado:** ↑ conversión en tickets altos, ↑ ticket promedio.
- **Métrica:** CVR por rango de precio, AOV, mix de medios de pago.
- **Prioridad:** 18 · **Impacto:** 4 · **Esfuerzo:** 2 · **Confianza:** 3 · **Urgencia:** 3
- **Tipo de implementación:** Cambio de contenido/front-end (mensaje de financiación) + validación con Mercado Pago/Fenicio.
- **Dependencia de Fenicio:** Media (bloque de pagos en plantilla).
- **Ejemplo de solución:** Línea bajo el precio: "3 cuotas sin interés con Mercado Pago" + fila de logos de medios.

### H10 — Sin compra como invitado: identificación obligatoria por OTP
- **Área:** F. Checkout
- **Página o URL:** `https://glassywaves.com.uy/mi-compra`
- **Evidencia observada:** El checkout inicia en "Identificate": "Ingresa tu email — Te enviaremos un código de verificación" (OTP 6 dígitos) o "Ingresar con Google". No hay opción visible de "continuar como invitado" (FAQ y condiciones confirman: se requiere cuenta).
- **Tipo:** Observación verificada; impacto en abandono = hipótesis (requiere analítica de checkout).
- **Problema:** El OTP obliga a salir a la casilla de correo a buscar un código antes de poder cargar datos → fricción en el primer comprador.
- **Impacto comercial:** Posible aumento de abandono en el paso de identificación.
- **Recomendación:** Ofrecer **compra como invitado** (o al menos permitir avanzar y crear cuenta al final); si el OTP se mantiene, optimizar copy y autocompletado del código.
- **Resultado esperado:** Menor abandono en identificación, más pedidos completados.
- **Métrica:** Tasa de avance del paso "Identificate", abandono de checkout por paso.
- **Prioridad:** 13,3 · **Impacto:** 4 · **Esfuerzo:** 3 · **Confianza:** 2 (depende de config Fenicio) · **Urgencia:** 3,5
- **Tipo de implementación:** Configuración Fenicio (si soporta guest checkout) — **requiere validación con Fenicio**.
- **Dependencia de Fenicio:** Alta.
- **Ejemplo de solución:** Botón "Comprar como invitado" + opción de crear cuenta post-compra con un clic.

### H11 — Sin umbral de envío gratis
- **Área:** F/H. Envíos / CRO (ticket)
- **Página o URL:** PDP (tabla de envío) y `/envios-y-devoluciones`
- **Evidencia observada:** No existe envío gratis por monto; el envío es pago (SoyDelivery $259, o $200 en compras > $6.000; DAC "paga al recibir"); solo el **retiro en local** es gratis. La competencia ofrece envío gratis por umbral (Rip Curl AR > $69.999; Underwave > $120.000; La Isla promociona envío gratis).
- **Tipo:** Observación verificada.
- **Problema:** El costo de envío es una de las primeras causas de abandono; sin umbral gratis no hay palanca de ticket.
- **Impacto comercial:** Menor AOV y más abandono en carrito.
- **Recomendación:** Definir un **umbral de envío gratis** (calculado sobre margen y AOV actual) con **barra de progreso** ("Te faltan $X para envío gratis"); mínimo, comunicar el retiro gratis como beneficio destacado.
- **Resultado esperado:** ↑ ticket promedio, ↓ abandono por costo de envío.
- **Métrica:** AOV, tasa de abandono de carrito, % pedidos sobre umbral.
- **Prioridad:** 24 · **Impacto:** 4 · **Esfuerzo:** 2 · **Confianza:** 4 · **Urgencia:** 3
- **Tipo de implementación:** Configuración Fenicio (regla de envío) + front-end (barra de progreso). Cambio operativo (definir umbral/margen).
- **Dependencia de Fenicio:** Media (reglas de envío configurables; validar barra de progreso).
- **Ejemplo de solución:** "Envío gratis a partir de $X" + barra dinámica en mini-cart y checkout.

### H12 — Móvil: zoom bloqueado y áreas táctiles chicas
- **Área:** G/M. Móvil / Accesibilidad
- **Página o URL:** todo el sitio (medido en PDP a 375px)
- **Evidencia observada:** `meta viewport = width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no` → **zoom deshabilitado**. Botón "Comprar" = 195×40px (alto < 44px recomendado). Selector de talle = **30×30px** (< 44px). Algunos elementos (enlace "Guía de talles", ciertos labels de precio) computan ~10px.
- **Tipo:** Observación verificada (mediciones computadas).
- **Problema:** Bloquear el zoom impide ampliar texto/imagen (barrera de accesibilidad, WCAG 1.4.4) y las áreas táctiles chicas dificultan seleccionar talle en mobile-first.
- **Impacto comercial:** Errores de selección, frustración y abandono en móvil (canal probablemente mayoritario).
- **Recomendación:** Quitar `user-scalable=no`/`maximum-scale=1`; agrandar targets de talle y botón a ≥44px; subir a ≥12–14px los textos secundarios.
- **Resultado esperado:** ↑ conversión móvil, ↓ errores de selección, mejor accesibilidad.
- **Métrica:** CVR móvil, tasa de add-to-cart móvil, errores de validación de talle.
- **Prioridad:** 45 · **Impacto:** 3 · **Esfuerzo:** 1 · **Confianza:** 5 · **Urgencia:** 3
- **Tipo de implementación:** Cambio de front-end (meta viewport + CSS de la plantilla).
- **Dependencia de Fenicio:** Baja/Media (editable en plantilla; validar que Fenicio permita tocar el meta).
- **Ejemplo de solución:** `content="width=device-width, initial-scale=1"` (sin lock) + talles como botones de 44×44px.

### H13 — Home sin H1 y metadatos débiles
- **Área:** J. SEO on-page
- **Página o URL:** `/` (home), `/vestimenta` (categoría), PDP
- **Evidencia observada:** Home: `h1count = 0` (**sin H1**); meta description de **categoría** = lista de keywords separadas por comas ("Vestimenta,Remeras,Camisas,Camperas,…"); meta description de **producto** autogenerada con el **código interno** ("Hoodie Original / Negro $ 1.758 (H98u)").
- **Tipo:** Observación verificada.
- **Problema:** Señales on-page débiles: home sin encabezado principal, metadatos poco atractivos/keyword-stuffed que exponen códigos internos.
- **Impacto comercial:** Menor CTR en resultados de Google y peor comprensión temática de las páginas.
- **Recomendación:** Agregar H1 semántico en home ("Ropa surf uruguaya | Glassy Waves"); redactar meta descriptions naturales por categoría; plantilla de meta de producto sin código interno.
- **Resultado esperado:** ↑ CTR orgánico, mejor relevancia temática.
- **Métrica:** CTR por página (Search Console), posición media, impresiones.
- **Prioridad:** 22,5 · **Impacto:** 3 · **Esfuerzo:** 2 · **Confianza:** 5 · **Urgencia:** 3
- **Tipo de implementación:** Configuración/contenido en Fenicio (campos SEO) + plantilla.
- **Dependencia de Fenicio:** Baja/Media (campos SEO editables; el H1 puede requerir ajuste de plantilla).
- **Ejemplo de solución:** H1 oculto-visualmente-consistente en home; patrón de meta "{Categoría}: {beneficio} | Glassy Waves".

### H14 — URLs facetadas indexables y auto-canónicas (riesgo de contenido duplicado / index bloat)
- **Área:** J. SEO técnico
- **Página o URL:** `https://glassywaves.com.uy/vestimenta?color=negro` (y `?marca=`)
- **Evidencia observada:** Las URLs de filtro **no** tienen `noindex`, se **auto-canonizan a la URL filtrada** (canonical = `…?color=negro`, no la base) y comparten **title/meta/H1** idénticos a la categoría base. Además están **incluidas en el sitemap** (`catalogo.xml`). `robots.txt` tiene `Disallow` vacío (todo crawleable).
- **Tipo:** Observación verificada.
- **Problema:** Google puede indexar decenas de variantes casi duplicadas → dilución de señales y presupuesto de rastreo desperdiciado.
- **Impacto comercial:** Menor eficiencia SEO; canibalización entre variantes.
- **Recomendación:** Canonicalizar los filtros a la categoría base (o `noindex,follow`) y **quitar** las URLs de filtro del sitemap; dejar en sitemap solo categorías y productos canónicos.
- **Resultado esperado:** Índice más limpio, mejor consolidación de autoridad.
- **Métrica:** Nº de URLs indexadas (Search Console), cobertura, impresiones de categorías.
- **Prioridad:** 12 · **Impacto:** 3 · **Esfuerzo:** 2 · **Confianza:** 4 · **Urgencia:** 2
- **Tipo de implementación:** Configuración Fenicio (canonical de facets, contenido del sitemap) — **validar con soporte/partner**.
- **Dependencia de Fenicio:** Alta.
- **Ejemplo de solución:** `rel=canonical` de `?color=` → `/vestimenta`; sitemap sin permutaciones de filtro.

### H15 — Sin JSON-LD y datos estructurados de producto incompletos
- **Área:** J. SEO técnico / rich results
- **Página o URL:** PDP, categoría y home
- **Evidencia observada:** No hay **JSON-LD** en ninguna página (`ld+json` = 0). Hay microdata de `Product`/`Offer` (con `priceCurrency=UYU`, `price`), pero `availability`, `itemCondition` y `priceValidUntil` están **vacíos**, y **faltan** `AggregateRating`, `BreadcrumbList` y `Organization`.
- **Tipo:** Observación verificada.
- **Problema:** Elegibilidad limitada para resultados enriquecidos (precio, stock, estrellas, migas) en Google.
- **Impacto comercial:** Menor CTR orgánico y peor presentación en SERP frente a competidores con rich snippets.
- **Recomendación:** Emitir JSON-LD completo de `Product`/`Offer` (con `availability` y precio), `BreadcrumbList` y `Organization`/`LocalBusiness` (hay tiendas físicas).
- **Resultado esperado:** Rich results (precio/stock/estrellas), ↑ CTR.
- **Métrica:** Cobertura de "Fragmentos de producto" en Search Console, CTR.
- **Prioridad:** 13,5 · **Impacto:** 3 · **Esfuerzo:** 2 · **Confianza:** 4,5 · **Urgencia:** 2
- **Tipo de implementación:** Configuración/desarrollo en plantilla Fenicio — **validar soporte de JSON-LD**.
- **Dependencia de Fenicio:** Alta.
- **Ejemplo de solución:** Bloque JSON-LD por PDP con `offers.availability = InStock/OutOfStock` y `aggregateRating` cuando existan reseñas.

### H16 — Peso de JavaScript elevado (~882 KB sin comprimir)
- **Área:** I. Rendimiento
- **Página o URL:** `/` (home)
- **Evidencia observada:** 5 recursos de script ≈ **882 KB decodificados** (Fenicio + GoPersonal) según Resource Timing; HTML inicial ~20 KB. Tiempos de una muestra: load ~739 ms (percibido rápido, **no** es Lighthouse). Peso de imágenes en bytes **no verificable** (sin `Timing-Allow-Origin`). CLS **no medido**.
- **Tipo:** Observación verificada (peso JS) + límites explícitos (CWV no medidos).
- **Problema:** El JS es el mayor peso medible; en redes móviles puede afectar interactividad (INP) y LCP.
- **Impacto comercial:** Un sitio más lento en móvil correlaciona con menor conversión.
- **Recomendación:** Medir con PageSpeed/CrUX; diferir/optimizar GoPersonal si no aporta ROI proporcional; auditar terceros.
- **Resultado esperado:** Mejores CWV, mejor conversión móvil.
- **Métrica:** LCP/INP/CLS (CrUX), TBT, conversión móvil.
- **Prioridad:** 8 · **Impacto:** 3 · **Esfuerzo:** 3 · **Confianza:** 2 · **Urgencia:** 2
- **Tipo de implementación:** Requiere validación con Fenicio/partner (control limitado sobre scripts de plataforma).
- **Dependencia de Fenicio:** Alta.
- **Ejemplo de solución:** Revisar necesidad de GoPersonal; lazy-load de scripts no críticos; presupuesto de performance.

### H17 — Sin hreflang ni localización para Argentina
- **Área:** J. SEO internacional / Mercado
- **Página o URL:** todo el sitio
- **Evidencia observada:** **Sin** `hreflang`. Sitio único `.com.uy`, `lang="es"`, precios solo en UYU (toggle a USD en checkout). Argentina es mercado declarado pero no hay targeting AR.
- **Tipo:** Observación verificada.
- **Problema:** Sin señales de segmentación por país ni experiencia AR (moneda/impuestos/envíos), la captación argentina es débil.
- **Impacto comercial:** Oportunidad AR sub-explotada; el comprador AR encuentra fricción (moneda/costos).
- **Recomendación:** Decisión estratégica: si AR es prioridad, evaluar experiencia AR (moneda/pagos/cuotas/envío) y señales geográficas; si no, ajustar el discurso "UY + AR" a la realidad.
- **Resultado esperado:** Claridad de mercado; base para expansión AR ordenada.
- **Métrica:** Tráfico/CVR por país, pedidos AR.
- **Prioridad:** 8 · **Impacto:** 4 · **Esfuerzo:** 4 · **Confianza:** 3 · **Urgencia:** 2
- **Tipo de implementación:** Iniciativa estratégica (posible desarrollo/integración + operación).
- **Dependencia de Fenicio:** Alta (capacidades multi-país/moneda a validar).
- **Ejemplo de solución:** Fase 1: comunicar claramente pago en USD y envíos a AR; Fase 2: evaluar tienda/experiencia AR dedicada.

### H18 — Confianza formal: "no devoluciones de dinero", emails @gmail, sin RUT e inconsistencias entre páginas
- **Área:** K. Confianza y servicio
- **Página o URL:** `/envios-y-devoluciones`, `/nosotros`, `/condiciones-de-compra`, `/preguntas-frecuentes`
- **Evidencia observada:**
  - "**No hacemos devoluciones de dinero, pero sí cambios por otros productos**" (`/envios-y-devoluciones`).
  - Dos emails **@gmail** distintos: `gwtrescruces@gmail.com` (nosotros/footer) y `glassywaves.sac@gmail.com` (condiciones).
  - `/nosotros` **sin** RUT, razón social, año de fundación ni nombres.
  - Inconsistencias: FAQ dice **2** locales (Punta Carretas + Costa Urbana); `/envios-y-devoluciones` lista **3** (agrega Tres Cruces); hay además Bulevar Artigas 1825 y La Barra. La ventana de cambio figura como **45 días** en FAQ pero **sin plazo** en la página de envíos/devoluciones.
- **Tipo:** Observación verificada (riesgo legal = hipótesis a validar con asesoría).
- **Problema:** La combinación eleva la ansiedad de compra y reduce la credibilidad; "no devoluciones de dinero" puede tensionar con el derecho de retracto de la Ley 17.250 de Relaciones de Consumo (venta a distancia) — **validar con asesoría legal**.
- **Impacto comercial:** Menor conversión (más objeción de riesgo), posible exposición legal/reputacional.
- **Recomendación:** Unificar contacto en email de marca (`@glassywaves.com.uy`); publicar identidad societaria/RUT; revisar la política de devoluciones con asesoría legal y comunicarla con claridad; corregir inconsistencias de locales/plazos.
- **Resultado esperado:** ↑ confianza y conversión, ↓ riesgo legal.
- **Métrica:** CVR, consultas pre-compra, tasa de disputa/reclamos.
- **Prioridad:** 36 · **Impacto:** 4 · **Esfuerzo:** 1–2 · **Confianza:** 4 · **Urgencia:** 4
- **Tipo de implementación:** Cambio operativo/de contenido (+ validación legal).
- **Dependencia de Fenicio:** Baja (contenido de páginas institucionales).
- **Ejemplo de solución:** Página única de "Cambios y Devoluciones" clara (plazo, condiciones, quién paga), footer con razón social + RUT + email de marca.

### H19 — Sin captación de leads con incentivo ni flujos de ciclo de vida
- **Área:** L. Retención y ciclo de vida
- **Página o URL:** home (footer "Newsletter: Suscribite") y sitio en general
- **Evidencia observada:** Hay un campo de newsletter en el footer ("¡Suscribite y recibí todas nuestras novedades!" + SUSCRIBIRME) **sin incentivo** (ej. % primer compra) y sin pop-up de captación. No se observaron señales de flujos automatizados (bienvenida, carrito abandonado, postcompra, solicitud de reseña).
- **Tipo:** Observación verificada (existencia de flujos internos = no verificable públicamente; validar con la marca).
- **Problema:** Se capta poca base de datos y no se monetiza el tráfico que no compra en la primera visita.
- **Impacto comercial:** Menor recompra, menor LTV, dependencia de tráfico pago para vender.
- **Recomendación:** Pop-up de captación con incentivo (ej. 10% primera compra) + integrar email/automation (bienvenida, carrito abandonado, postcompra, reseña, reactivación). Aprovechar la comunidad (surf camps) como fuente de leads.
- **Resultado esperado:** ↑ base de suscriptores, ↑ recompra y LTV, recuperación de carritos.
- **Métrica:** Altas de email/mes, ingresos por email, tasa de recuperación de carrito.
- **Prioridad:** 24 · **Impacto:** 4 · **Esfuerzo:** 2 · **Confianza:** 4 · **Urgencia:** 3
- **Tipo de implementación:** Integración con herramienta externa (email/automation) + operación de contenido.
- **Dependencia de Fenicio:** Media (Fenicio suele integrarse con plataformas de email; validar conector).
- **Ejemplo de solución:** Pop-up con incentivo + secuencias de bienvenida y carrito abandonado en la herramienta de email.

### H20 — Sin programa de fidelización ni mecánicas de recompra/UGC
- **Área:** L/H. Fidelización
- **Página o URL:** sitio en general
- **Evidencia observada:** No hay programa de puntos/beneficios, referidos, ni UGC/reseñas. (Ningún competidor relevado exhibe un programa formal → **espacio en blanco**.)
- **Tipo:** Observación verificada + oportunidad de mercado.
- **Problema:** La comunidad (activo diferencial) no se traduce en mecánicas de recompra ni referidos.
- **Impacto comercial:** LTV y boca-a-boca sub-explotados; menor defensa frente a competidores.
- **Recomendación:** Lanzar programa de fidelidad/beneficios ligado a la comunidad (puntos, acceso a drops/surf camps, referidos), con UGC como combustible.
- **Resultado esperado:** ↑ frecuencia de compra, ↑ LTV, ↑ adquisición por referidos.
- **Métrica:** % clientes recurrentes, frecuencia de compra, referidos, LTV.
- **Prioridad:** 12 · **Impacto:** 4 · **Esfuerzo:** 4 · **Confianza:** 3 · **Urgencia:** 2,5
- **Tipo de implementación:** Iniciativa estratégica (integración externa de loyalty + operación).
- **Dependencia de Fenicio:** Media/Alta (integración a validar).
- **Ejemplo de solución:** "Glassy Crew": puntos por compra/UGC, beneficios en surf camps y acceso anticipado a drops.

---

## 6. Auditoría móvil

**Positivo (verificado):** el sitio es responsive con **barra de compra fija (sticky add-to-cart)** en PDP (`form.frmComprar` en `position: fixed`) y **botón de WhatsApp flotante**; menú hamburguesa (`mainMenuMobile.show()`); imágenes WebP con lazy-load.

**A corregir (verificado, 375px):**
- **Zoom deshabilitado:** `user-scalable=no, maximum-scale=1` (barrera de accesibilidad; ver H12).
- **Áreas táctiles chicas:** selector de talle 30×30px, botón "Comprar" 40px de alto (< 44px recomendado).
- **Tipografía secundaria pequeña:** enlace "Guía de talles" y ciertos labels de precio ~10px (H1 25px y texto de envío 16px están bien). Con zoom bloqueado, no hay forma de agrandar.
- **Multi-precio apilado** (H5) se vuelve más denso en pantalla angosta.
- **Checkout con OTP** (H10) es más costoso en móvil (cambiar de app al mail y volver).

**Hipótesis a validar con analítica:** siendo un público joven mobile-first, es probable que la mayoría del tráfico y de las pérdidas de conversión estén en móvil; priorizar los fixes móviles primero. Requiere datos de rendimiento por dispositivo (Sección 17).

---

## 7. Auditoría del carrito y checkout

**Flujo (verificado, sin completar pago):** agregar al carrito abre popup de confirmación con **cross-sell** ("Continuar en el sitio" / "Finalizar la compra" → `/mi-compra`). En `/mi-compra`:
- **Identificación obligatoria** por email + OTP 6 dígitos o Google; **sin invitado** (H10).
- **Progreso en 3 pasos:** Datos de facturación → Datos de envío → Forma de pago.
- **Resumen de pedido** con: imagen/nombre, "Talle M", **cantidad editable** (+/−), **quitar artículo**, desglose de precio (lista tachada + descuento con nombre de promo + neto), **bolsa de papel $0** y **upsell "Quiero agregar bolsa de tela"**.
- **Cupón de descuento** ("¿Tienes un cupón de descuento?").
- **Moneda de pago** conmutable **$ (UYU) / USD**.
- **Observaciones** del pedido.
- **reCAPTCHA** presente.

**Fortalezas:** desglose claro, edición completa, cupón, multimoneda, upsell de bolsa, cross-sell en add-to-cart.

**Fricciones / oportunidades:**
1. **OTP obligatorio / sin invitado** (H10) — principal fricción de primer comprador.
2. **Sin umbral de envío gratis** ni barra de progreso (H11).
3. **Cuotas/medios no anticipados** antes del pago (H9).
4. **Persistencia del carrito:** el ítem persistió al navegar a `/mi-compra` (verificado); no verificado entre sesiones/dispositivos (requiere prueba autenticada).
5. **Nombre de descuento poco claro** en el resumen ("buzo conmemoración" como etiqueta del descuento del hoodie) — revisar naming de promociones.
6. **Recuperación de carrito abandonado:** no verificable públicamente; dado que se captura email al inicio, hay **base para** un flujo de carrito abandonado (validar si existe — Sección 17).

---

## 8. Auditoría SEO y técnica

**Verificado — fortalezas:**
- **URLs legibles** (`/vestimenta`, `/catalogo/{slug}_{CODE}_u`), normalización de trailing slash (`/vestimenta/` → `/vestimenta`).
- **404 con status real** (no soft-404).
- **`robots.txt`** presente (`Disallow` vacío, `Sitemap: /sitemap`); **sitemap index** con 5 hijos (~274 URLs).
- **Imágenes WebP** con `alt` casi completo y **lazy-load** correcto; hero no lazy.
- **Open Graph** completo; canonicals self-referenciales en home/categoría/producto.

**Verificado — a corregir:**
- **Home sin H1** (H13).
- **Meta descriptions débiles**: categoría = lista de keywords; producto = autogenerada con código interno (H13).
- **URLs facetadas indexables/auto-canónicas y en sitemap** → duplicados/index bloat (H14).
- **Sin JSON-LD**; microdata incompleta (sin `availability`, `AggregateRating`, `BreadcrumbList`, `Organization`) (H15).
- **Sin `hreflang`** ni experiencia AR (H17).
- **Sin migas de pan (breadcrumbs)** visibles en PDP (solo menú principal) → navegación y `BreadcrumbList` ausentes.
- **Contenido delgado** en PDP (sin descripción) y en categorías (sin texto SEO) (H6).
- **Variante por mayúsculas:** `/Vestimenta` responde 200 sin redirect (posible duplicado por case) — validar canonical.
- Twitter card `summary` (no `summary_large_image`).

**Rendimiento (cualitativo, una muestra — NO Lighthouse):** ~882 KB de JS (Fenicio + GoPersonal) como mayor peso medible; HTML ~20 KB; load ~739 ms en una muestra. Peso de imágenes y CWV (LCP/CLS/INP) **no medidos** — correr PageSpeed/CrUX (H16).

**Oportunidades de contenido/keywords:** categorías con texto optimizado (ej. "buzos surf hombre/mujer Uruguay"), guías informativas (tallas, cuidado de neoprene, "cómo elegir…"), y aterrizajes por intención transaccional local ("comprar hoodie surf Uruguay").

---

## 9. Auditoría de confianza y retención

**Confianza (verificado):**
- **A favor:** WhatsApp con número y **horarios** visibles (092 039 029; Dom–Jue 9–21, Vie–Sáb 9–22), varias **tiendas físicas** + retiro gratis, pagos por **Mercado Pago** ("es seguro usar mi tarjeta"), tracking por email.
- **En contra:** **"no devoluciones de dinero"**, **dos emails @gmail** distintos, **sin RUT/identidad societaria**, **sin reseñas/UGC**, e **inconsistencias** entre páginas (nº de locales, plazo de cambios) (H18). No se verificó enlace visible a redes sociales desde el sitio (validar).

**Retención / ciclo de vida (verificado / no verificable):**
- Newsletter en footer **sin incentivo**; **sin pop-up** de captación (H19).
- **Sin** programa de fidelidad, referidos ni UGC (H20).
- Flujos de email (bienvenida, carrito abandonado, postcompra, reseña, reactivación): **no verificables públicamente** — la captura de email en checkout habilita técnicamente el de carrito abandonado; validar qué existe hoy.
- **Personalización:** GoPersonal está instalado (recomendados, "últimos productos vistos"); su uso/ROI real no es verificable públicamente.

**Qué es Fenicio vs. externo:**
- *Fenicio nativo (a validar):* cupones, recomendados, "vistos recientemente", páginas institucionales, reglas de envío.
- *Integración externa típica:* email marketing/automation, reseñas/UGC, loyalty/referidos, aviso de restock.

---

## 10. Análisis del mercado

**Fuentes:** navegación de sitios de competidores y búsqueda web (2026-07-13); ver "Fuentes" al final.

- **Plataformas:** el e-commerce surf/indumentaria en Uruguay está **muy concentrado en Fenicio** (Glassy Waves, La Isla y Rusty UY, verificados). En Argentina domina Tiendanube (Bayu) y WooCommerce (Rip Curl AR, Underwave). *Implicación:* en UY la diferenciación no vendrá de la plataforma (todos comparten la base Fenicio) sino de **marca, contenido, merchandising y servicio**.
- **Calendario promocional:** Hot Sale AR (mayo), Cyber Monday AR (noviembre), Ciberlunes UY; y fuerte **estacionalidad de verano** (dic–feb) + pico Punta del Este. Pre-season drops y liquidación de fin de temporada importan tanto como los Cyber.
- **Mecánicas promocionales (estándar):** en **UY dominan los descuentos por banco** (BBVA 20–30% en Glassy Waves; Santander 15% en La Isla; Scotiabank 15% en Rusty). En **AR dominan las cuotas sin interés** (Underwave hasta 12; Billabong 6; Rip Curl 3) + **descuento por transferencia** (10–20%). **Envío gratis por umbral** es casi universal. También "2da unidad" (Rusty) y descuento por newsletter.
- **Expectativas del comprador:** amplitud de pagos locales, WhatsApp, catálogo mobile-first, cambios flexibles, y precio/logística "estilo Mercado Libre" como vara implícita.
- **Diferenciadores comunes:** comunidad/contenido, sostenibilidad, omnicanalidad, y —en marcas heritage— profundidad técnica de producto e historia de origen.
- **Amenazas:** marcas globales (Rip Curl/Quiksilver/Billabong) con catálogo y financiación; el **breadth de La Isla** (100+ marcas); **Mercado Libre** en precio/cuotas/logística; y la **macro argentina** para expandir.
- **Espacios de posicionamiento / oportunidades:** **programa de fidelidad formal** (nadie lo tiene), **comunidad como moat**, **sostenibilidad** (x Origen) sub-explotada, y una eventual **expansión AR** ordenada (requiere igualar cuotas).

---

## 11. Benchmark competitivo

Selección (5–8) con criterio explícito. Datos de sitios públicos al 2026-07-13; precios volátiles.

**Directos — Uruguay**
- **Rusty Uruguay** (`rusty.uy`, **Fenicio**) — *el comparable más 1:1.* Mismo modelo (marca propia surf/lifestyle), misma plataforma, mismo rango de precio. **Mecánicas superiores:** "50% OFF 2da unidad", SALE agresivo, Scotiabank 15%, **cambios 30 días**, muchos medios de pago, PedidosYa exprés en Montevideo. *Glassy Waves puede adaptar:* 2da unidad, cambios claros. *Evitar:* nada crítico; benchmark de paridad.
- **La Isla** (`laisla.com.uy`, **Fenicio**) — *líder de categoría / breadth.* Multimarca 100+ marcas, Santander 15%, **cuotas sin interés**, Mercado Pago, gift cards, **calculadora de volumen de tabla**, envío gratis. *Adaptar:* financiación, gift cards, herramientas de ayuda a la decisión. *Evitar:* competir por amplitud de catálogo (no es su juego).
- **Flesh Surfshop** (`flesh.com.uy`) — *surfshop especialista (Punta del Este), multimarca.* Representa el canal surfshop (junto a Bajamar, República, Tablas, Lineup). *Adaptar:* posicionamiento costero/turístico. *Evitar:* depender de marcas de terceros.

**Regionales — Argentina**
- **Underwave** (`underwavebrand.com`) — *mejor par regional de marca propia.* **Hasta 12 cuotas sin interés**, 20% por transferencia, envío gratis > $120.000, 15% newsletter. *Adaptar (si va a AR):* financiación y captación por newsletter. 
- **Bayu** (`bayu.com.ar`, Tiendanube) — *beachwear/bikinis AR.* Cubre el segmento bikini de Glassy Waves en AR.

**Referente / aspiracional**
- **Rip Curl Argentina** (`ripcurlargentina.com`) — *estándar de storytelling, catálogo y ficha.* 3 cuotas sin interés, **envío gratis > $69.999**, wishlist, SALE. *Adaptar:* profundidad y calidad de ficha, narrativa de marca. *Evitar:* imitar su escala/tono corporativo global.

**Indirecto**
- **Mercado Libre (UY/AR)** — *ancla de precio, cuotas y logística.* Fija expectativas y es canal de reventa. *Adaptar:* claridad de envío/plazos y financiación. *Evitar:* competir solo por precio.

**Lectura transversal:** Glassy Waves iguala o supera en **marca/comunidad**, pero queda **por debajo en ficha de producto, prueba social, financiación visible y envío gratis** frente a casi todos.

---

## 12. Matriz comparativa

Escala 1–5 (5 = mejor). Basado en observación de los sitios (2026-07-13).

| Criterio | Glassy Waves | Rusty UY (directo) | La Isla (líder UY) | Underwave AR (regional) | Rip Curl AR (referente) |
|---|---|---|---|---|---|
| **Propuesta de valor / marca** | 4 — identidad y comunidad fuertes | 4 — marca joven consolidada | 3 — multimarca, poca marca propia | 3 — marca propia correcta | 5 — heritage global |
| **Catálogo / breadth** | 3 — línea propia acotada | 3 — similar | 5 — 100+ marcas | 3 — acotado | 4 — amplio y técnico |
| **Precios / financiación visible** | 2 — solo descuentos BBVA, sin cuotas visibles | 3 — 2da unidad + banco | 4 — cuotas sin interés + banco | 5 — 12 cuotas + transferencia | 4 — 3 cuotas + envío gratis |
| **Ficha de producto** | 2 — sin descripción/reseñas | 3 — más completa | 3 — correcta | 3 — correcta | 5 — rica en detalle |
| **Prueba social / reseñas** | 1 — inexistente | 2 — limitada | 2 — limitada | 2 — limitada | 3 — presente |
| **Contenido / comunidad** | 4 — surf camps, blog, x Origen | 4 — cultura joven | 2 — transaccional | 2 — básico | 4 — storytelling |
| **Confianza / servicio** | 3 — WhatsApp/omnicanal, pero no-devoluciones/Gmail | 4 — políticas claras | 4 — trayectoria | 3 — estándar | 4 — marca global |
| **Envíos (gratis por umbral)** | 2 — sin umbral gratis | 3 — exprés local | 4 — envío gratis | 4 — gratis > umbral | 4 — gratis > umbral |
| **Experiencia móvil** | 3 — sticky ATC ok; zoom/targets | 3 — estándar Fenicio | 3 — estándar Fenicio | 3 — Tiendanube | 4 — pulida |
| **Fidelización / recompra** | 2 — sin programa | 2 — sin programa | 2 — gift cards | 3 — newsletter | 3 — wishlist/CRM |
| **Promedio orientativo** | **2,6** | **3,1** | **3,2** | **3,1** | **4,0** |

*Nota:* la brecha vs. referente (Rip Curl) es esperable; lo accionable es cerrar la brecha vs. **directos** (Rusty/La Isla), sobre todo en **financiación visible, ficha, prueba social y envío gratis**, donde Glassy Waves puntúa por debajo.

---

## 13. Oportunidades de diferenciación

**Producto**
- Explotar **x Origen** (sostenibilidad) como línea con narrativa propia y sello visible en PDP/tarjetas.
- Curaduría de **drops** con edición limitada (escasez real) y colaboraciones con la comunidad/riders.

**Precio**
- Hacer **legible y potente** el sistema de descuentos (H5) y sumar **financiación visible** (cuotas) para competir con AR/La Isla (H9).
- **Bundles** temáticos (ej. "kit playa": remera + gorra + chancletas) con ahorro.

**Experiencia**
- Ficha rica (H6), reseñas con foto (H7), filtros/orden (H4), buscador que recupera (H3), móvil sin fricción (H12): la mayor palanca de conversión.
- **Guía de talles interactiva** y "encontrá tu talle" (reduce cambios).

**Contenido**
- Blog activo por estacionalidad (surf, playa, viajes) + SEO informativo; lookbooks y "shop the look" (ya hay sección "Shop de Look").
- Guías: "cómo elegir tu buzo", "cuidado de tu neoprene", "tallas Glassy".

**Servicio**
- Política de cambios/devoluciones clara y confiable (H18); seguimiento proactivo por WhatsApp; **aviso de restock** por talle (H8).

**Comunidad** *(mayor moat)*
- Convertir surf camps + comunidad en **motor de UGC** y adquisición; **contenido de clientes** en PDP.

**Fidelización**
- **"Glassy Crew"**: programa de puntos/beneficios + referidos + acceso anticipado a drops y surf camps (H20).

**Tecnología**
- Email/automation (bienvenida, carrito abandonado, postcompra) (H19); datos estructurados/rich results (H15); medición CWV y performance (H16); usar GoPersonal para recomendaciones reales.

---

## 14. Backlog priorizado

Puntaje = (Impacto × Confianza × Urgencia) ÷ Esfuerzo. Orientativo, **no** predicción financiera. Ordenado por puntaje.

| Nº | Oportunidad | Evidencia | Imp. | Esf. | Conf. | Urg. | Puntaje | Responsable | Dependencia Fenicio | Métrica |
|---|---|---|---|---|---|---|---|---|---|---|
| H12 | Habilitar zoom + agrandar targets móviles | `viewport user-scalable=no`; talle 30px, botón 40px | 3 | 1 | 5 | 3 | **45,0** | Front-end | Baja/Media | CVR móvil |
| H18 | Confianza: email de marca, RUT, revisar no-devoluciones, unificar inconsistencias | "no devoluciones de dinero"; 2 Gmail; sin RUT | 4 | 1,5 | 4 | 4 | **42,7** | Ops/Legal/Contenido | Baja | CVR, reclamos |
| H6 | Ficha con descripción/material/calce/cuidado | PDP hoodie sin descripción | 5 | 3 | 5 | 4 | **33,3** | Contenido | Baja | CVR PDP, cambios |
| H5 | Precios con jerarquía y etiquetas en tarjetas | 4 números sin rótulo en listados | 4 | 2 | 4 | 4 | **32,0** | Front-end | Media | CTR→PDP, CVR |
| H3 | Buscador: tolerancia + "sin resultados" con recuperación | "remra" → 0 resultados, sin salida | 4 | 3 | 5 | 4 | **26,7** | Fenicio/Front-end | Alta | % búsq. sin result., CVR |
| H11 | Umbral de envío gratis + barra de progreso | sin envío gratis; competencia sí | 4 | 2 | 4 | 3 | **24,0** | Ops/Fenicio | Media | AOV, abandono |
| H4 | Filtros (talle/color) + ordenamiento | solo filtro de precio, sin orden | 4 | 3 | 4 | 4,5 | **24,0** | Fenicio/Front-end | Media/Alta | Prod. vistos, CVR |
| H19 | Captación de leads + flujos de ciclo de vida | newsletter sin incentivo, sin pop-up | 4 | 2 | 4 | 3 | **24,0** | Marketing/Integración | Media | Leads, ingresos email |
| H13 | H1 en home + metadatos | `h1count=0`; meta keyword-stuffed | 3 | 2 | 5 | 3 | **22,5** | SEO/Contenido | Baja/Media | CTR, posición |
| H1 | Barra de beneficios / razones de compra | home sin trust-bar | 4 | 2 | 4 | 2,5 | **20,0** | Front-end/Contenido | Baja | CVR nuevos |
| H2 | Curar blog (sacar notas 2022 del home) | notas JUN 2022 en portada | 2 | 1 | 5 | 2 | **20,0** | Contenido | Baja | Orgánico blog |
| H9 | Cuotas/medios visibles en PDP | PDP sin cuotas/medios | 4 | 2 | 3 | 3 | **18,0** | Contenido/MP | Media | CVR ticket alto, AOV |
| H7 | Reseñas/UGC en PDP y tarjetas | sin `AggregateRating` | 4 | 3 | 4 | 3 | **16,0** | Integración | Media/Alta | CVR, nº reseñas |
| H15 | JSON-LD completo + breadcrumbs | `ld+json=0`, microdata incompleta | 3 | 2 | 4,5 | 2 | **13,5** | SEO/Dev | Alta | Rich results, CTR |
| H10 | Compra como invitado / optimizar OTP | checkout OTP, sin invitado | 4 | 3 | 2 | 3,5 | **13,3** | Fenicio | Alta | Abandono identificación |
| H8 | Talles agotados visibles + aviso restock | solo XS/S/M visibles | 3 | 3 | 3 | 4 | **12,0** | Fenicio/Integración | Media/Alta | Waitlist, ventas restock |
| H14 | Canonicalizar facets + limpiar sitemap | `?color=` indexable/auto-canónico | 3 | 2 | 4 | 2 | **12,0** | SEO/Fenicio | Alta | URLs indexadas |
| H20 | Programa de fidelización "Glassy Crew" | sin loyalty/referidos | 4 | 4 | 3 | 2,5 | **7,5** | Estrategia/Integración | Media/Alta | Recompra, LTV |
| H16 | Medir/optimizar performance (CWV) | ~882 KB JS | 3 | 3 | 2 | 2 | **4,0** | Dev/Fenicio | Alta | LCP/INP/CLS |
| H17 | Definir experiencia Argentina | sin hreflang/localización AR | 4 | 4 | 3 | 2 | **6,0** | Estrategia | Alta | CVR/pedidos AR |

**Clasificación:**
- **Problemas críticos:** H6 (ficha vacía), H3 (buscador sin salida), H18 (confianza/no-devoluciones).
- **Quick wins** (bajo esfuerzo, alta confianza): H12, H18, H2, H13, H1, H5.
- **Proyectos de impacto medio:** H6, H4, H11, H19, H9, H7.
- **Iniciativas estratégicas:** H20 (fidelización), H17 (Argentina), H10 (guest checkout), H16 (performance).
- **Experimentos:** ver Sección 16 (H5, H11, H1, H6, H19, etc. como tests A/B).

---

## 15. Plan de acción

### Primeros 30 días — correcciones y medición base
- **Instrumentar analítica**: GA4 + eventos de embudo (view_item, add_to_cart, begin_checkout, purchase), Search Console, y **PageSpeed/CrUX**. (Habilita todo lo demás; ver Sección 17.)
- **Quick wins de confianza y móvil**: quitar bloqueo de zoom y agrandar targets (H12); email de marca + RUT + revisar/clarificar devoluciones y corregir inconsistencias (H18); curar blog del home (H2); H1 + metadatos base (H13); trust-bar de beneficios (H1).
- **Precios legibles** en tarjetas (H5).
- **Rediseñar página de "sin resultados"** del buscador y pedir a Fenicio activar fuzzy/sinónimos (H3, primera mitad).

### De 31 a 60 días — experiencia, contenido y merchandising
- **Poblar fichas** (descripción/material/calce/cuidado) del top 50–100 productos (H6).
- **Filtros (talle/color) + ordenamiento** en listados (H4).
- **Umbral de envío gratis** + barra de progreso (H11).
- **Captación de leads** (pop-up con incentivo) + **flujo de bienvenida y carrito abandonado** (H19).
- **Cuotas/medios visibles** en PDP (validar con Mercado Pago) (H9).

### De 61 a 90 días — desarrollo, integraciones y experimentos
- **Reseñas/UGC** con foto (H7) + solicitud postcompra.
- **JSON-LD + breadcrumbs** y limpieza de facets/sitemap (H15, H14).
- **Aviso de restock** por talle + mostrar agotados (H8).
- **Guest checkout / optimización de OTP** (validar con Fenicio) (H10).
- **Arrancar los A/B tests** de la Sección 16 con volumen suficiente.

### De 3 a 12 meses — estratégico y diferenciación
- **Programa de fidelización "Glassy Crew"** + referidos (H20).
- **Estrategia Argentina** (moneda/cuotas/envío/hreflang) si el dato de demanda AR lo justifica (H17).
- **Contenido/SEO informativo** sostenido (guías, lookbooks) y calendario editorial.
- **Performance/CWV** optimizados con Fenicio/partner (H16).
- **Personalización** real con GoPersonal (recomendados por comportamiento).

---

## 16. Plan de experimentación (A/B)

> Duraciones/volúmenes sugeridos sin inventar tráfico: correr cada test hasta **significancia estadística** (p. ej. ≥95%) con un **mínimo de conversiones por variante** (regla práctica: ~200–300 conversiones/variante) o **2–4 semanas** completas (ciclos de fin de semana). Ajustar con el tráfico real (Sección 17).

1. **Ficha enriquecida** — *Hipótesis:* agregar descripción/material/calce/cuidado sube CVR de PDP. *Página:* PDP. *Segmento:* todo. *Variante:* PDP con bloque de contenido vs. actual. *KPI:* CVR PDP. *Control:* tasa de cambios, add-to-cart. *Riesgo:* costo de redacción. *Ganadora:* +uplift CVR con signif. ≥95%.
2. **Precio con jerarquía** — *H:* mostrar venta+tachado+%OFF+"BBVA desde" (vs. 4 números) sube CTR→PDP y CVR. *Página:* listados. *Segmento:* todo. *KPI:* CTR tarjeta→PDP. *Control:* CVR, AOV. *Riesgo:* percepción de descuento. *Ganadora:* +CTR y CVR no negativo.
3. **Umbral de envío gratis + barra** — *H:* introducir envío gratis sobre $X sube AOV. *Página:* mini-cart/checkout. *Segmento:* todo. *KPI:* AOV. *Control:* margen, abandono, CVR. *Riesgo:* costo logístico. *Ganadora:* AOV↑ con margen neto ≥ actual.
4. **Reseñas en PDP** — *H:* estrellas/reseñas suben CVR. *Página:* PDP. *Segmento:* productos con ≥5 reseñas. *KPI:* CVR. *Control:* devoluciones. *Riesgo:* reseñas negativas. *Ganadora:* CVR↑ signif.
5. **Página de "sin resultados"** — *H:* sugerencias+productos+categorías reducen salidas. *Página:* `/catalogo?q=` sin resultados. *Segmento:* búsquedas fallidas. *KPI:* tasa de salida tras búsqueda. *Control:* CVR asistida por búsqueda. *Riesgo:* bajo. *Ganadora:* salida↓.
6. **Pop-up de captación con incentivo** — *H:* 10% primera compra sube altas de email sin dañar CVR. *Página:* sitio. *Segmento:* nuevos. *KPI:* tasa de suscripción. *Control:* CVR, rebote. *Riesgo:* intrusividad. *Ganadora:* leads↑ y CVR estable.
7. **Guest checkout vs. OTP** — *H:* permitir invitado reduce abandono en identificación. *Página:* `/mi-compra`. *Segmento:* nuevos. *KPI:* avance del paso identificación. *Control:* creación de cuenta, CVR final. *Riesgo:* menos cuentas. *Ganadora:* abandono↓ y CVR↑. *(Depende de Fenicio.)*
8. **Cuotas visibles en PDP** — *H:* "N cuotas sin interés" sube CVR en ticket alto. *Página:* PDP camperas/buzos. *Segmento:* ticket > $2.500. *KPI:* CVR de ese segmento. *Control:* AOV, mix de pago. *Riesgo:* dependencia de MP. *Ganadora:* CVR↑.
9. **Trust-bar de beneficios en home/PDP** — *H:* comunicar retiro gratis/cambios/pagos sube CVR de nuevos. *Página:* home+PDP. *Segmento:* nuevos. *KPI:* CVR nuevos. *Control:* rebote. *Riesgo:* bajo. *Ganadora:* CVR↑.
10. **Bundles / cross-sell "completá el look"** — *H:* sugerir kit sube AOV/UPT. *Página:* PDP/carrito. *Segmento:* todo. *KPI:* unidades por transacción (UPT)/AOV. *Control:* CVR. *Riesgo:* distracción. *Ganadora:* AOV↑ sin caída de CVR.
11. **Filtros de talle/color** — *H:* filtrar sube productos vistos y add-to-cart. *Página:* listados. *KPI:* add-to-cart rate. *Control:* CVR. *Riesgo:* complejidad. *Ganadora:* add-to-cart↑.
12. **Barra sticky de progreso a envío gratis en móvil** — *H:* refuerza el umbral y sube AOV móvil. *Página:* móvil carrito/PDP. *KPI:* AOV móvil. *Control:* CVR móvil. *Ganadora:* AOV móvil↑.

---

## 17. Información adicional necesaria

Para pasar de hipótesis a certezas y priorizar con datos reales, solicitar internamente:
- **Tráfico** (sesiones, fuentes/canales, share móvil vs. desktop) — GA4.
- **Conversión global y por dispositivo/canal**; **AOV/ticket promedio**.
- **Embudo y abandono** por paso de checkout (identificación, envío, pago) — analítica de checkout.
- **Búsquedas internas** (términos más buscados, % sin resultados).
- **Productos vistos / agregados al carrito / más vendidos**; **rotación por talle/color**.
- **Productos sin stock** y quiebres por talle (para H8).
- **Cambios/devoluciones** (tasa, motivos) — valida impacto de fichas/tallas.
- **Clientes nuevos vs. recurrentes, cohortes, frecuencia y LTV**.
- **Márgenes por categoría** y **costos de envío** (para calibrar umbral gratis y cuotas).
- **Datos de campañas** (inversión, ROAS por canal) y **estado de flujos de email** (si existen bienvenida/carrito abandonado y su performance).
- **Config de Fenicio y Mercado Pago**: capacidades de guest checkout, fuzzy search, facets, canonical de filtros, JSON-LD, cuotas.

---

## Fase 3 — Clasificación por tipo de implementación (Fenicio)

> No se afirma disponibilidad de una función de Fenicio sin evidencia; los ítems "Alta dependencia" **requieren validación con soporte/partner de Fenicio**.

| Recomendación | Área | Tipo de implementación | Complejidad estimada | Dependencia de Fenicio | Validación necesaria |
|---|---|---|---|---|---|
| Habilitar zoom + targets ≥44px (H12) | Móvil/A11y | Cambio de front-end (meta+CSS) | Baja | Baja/Media | ¿La plantilla permite editar el meta viewport? |
| Confianza: email marca, RUT, devoluciones, inconsistencias (H18) | Confianza | Cambio operativo/contenido (+legal) | Baja | Baja | Revisión legal (Ley 17.250) |
| Poblar fichas (descripción/material/calce/cuidado) (H6) | PDP/Contenido | Cambio de contenido (campo descripción) | Media (volumen) | Baja | Confirmar campos de ficha |
| Precios con jerarquía/etiquetas en tarjetas (H5) | Listados | Cambio de diseño/front-end de la card | Media | Media | Alcance de edición de la card |
| Buscador fuzzy + "sin resultados" con recuperación (H3) | Buscador | Config Fenicio + front-end | Media | **Alta** | ¿Fenicio soporta fuzzy/sinónimos y edición de esa página? |
| Umbral de envío gratis + barra (H11) | Envíos/CRO | Config Fenicio (regla) + front-end | Media | Media | ¿Reglas de envío por monto + barra de progreso? |
| Filtros talle/color + ordenamiento (H4) | Listados | Config Fenicio (facets) + front-end | Media | Media/**Alta** | ¿Facets y sort habilitables en plantilla? |
| Captación de leads + automation (H19) | Retención | Integración externa + operación | Media | Media | Conector de email disponible |
| H1 + metadatos (H13) | SEO | Config/contenido (+plantilla para H1) | Baja | Baja/Media | ¿H1 editable en home? |
| Trust-bar de beneficios (H1) | Comunicación | Front-end + contenido | Baja | Baja | Bloque configurable en home/PDP |
| Curar blog (H2) | Contenido | Cambio operativo | Baja | Baja | — |
| Cuotas/medios en PDP (H9) | Precio | Contenido/front-end + validación MP | Baja | Media | Cuotas reales en Mercado Pago |
| Reseñas/UGC (H7) | Prueba social | Integración externa + inserción en plantilla | Media | Media/**Alta** | Compatibilidad de la app con Fenicio |
| JSON-LD + breadcrumbs (H15) | SEO técnico | Desarrollo en plantilla | Media | **Alta** | ¿Se puede inyectar JSON-LD y breadcrumbs? |
| Guest checkout / OTP (H10) | Checkout | Config Fenicio | Media | **Alta** | ¿Fenicio permite compra como invitado? |
| Talles agotados + restock (H8) | PDP | Config Fenicio + integración | Media | Media/**Alta** | ¿Mostrar agotados? ¿App de restock? |
| Canonical de facets + sitemap (H14) | SEO técnico | Config Fenicio | Media | **Alta** | Control de canonical/sitemap |
| Loyalty "Glassy Crew" (H20) | Fidelización | Integración externa + operación | Alta | Media/**Alta** | Conector de loyalty |
| Performance/CWV (H16) | Técnico | Requiere partner/Fenicio | Media | **Alta** | Control sobre scripts de plataforma |
| Experiencia Argentina (H17) | Estratégico | Desarrollo/integración + operación | Alta | **Alta** | Capacidades multi-país/moneda |

---

## Fuentes (mercado y competencia)

Glassy Waves: [home](https://glassywaves.com.uy/), [/nosotros](https://glassywaves.com.uy/nosotros), [/envios-y-devoluciones](https://glassywaves.com.uy/envios-y-devoluciones), [/preguntas-frecuentes](https://glassywaves.com.uy/preguntas-frecuentes), [/como-comprar](https://glassywaves.com.uy/como-comprar), [/condiciones-de-compra](https://glassywaves.com.uy/condiciones-de-compra), [BBVA descuentos](https://www.bbva.com.uy/personas/productos/tarjetas/descuentos/moda/glassy-waves.html).
Competidores: [Rusty UY](https://rusty.uy/), [La Isla](https://laisla.com.uy/), [Flesh](https://www.flesh.com.uy/), [Bajamar](https://bajamar.com.uy/), [República](https://www.tiendarepublica.com/), [Underwave](https://underwavebrand.com/), [Bayu](https://www.bayu.com.ar/), [Rip Curl AR](https://www.ripcurlargentina.com/), [Quiksilver AR](https://www.quiksilver.com.ar/), [Billabong AR](https://www.billabong.com.ar/), [Mercado Libre AR](https://www.mercadolibre.com.ar/).
Contexto de mercado: Hot Sale / Cyber Monday AR (CACE), Ciberlunes UY. Precios y features observados en cada sitio al 2026-07-13.

---

# Las 10 decisiones que Glassy Waves debería tomar primero

1. **Poblar las fichas de producto con contenido real.**
   - *Qué:* agregar descripción, material/composición, calce y cuidado al top 50–100 productos.
   - *Por qué:* el PDP —punto de decisión— está vacío (H6); afecta conversión, cambios y SEO.
   - *Dónde:* campo de descripción de Fenicio en `/catalogo/*`.
   - *Responsable:* Contenido/CM. · *Complejidad:* Media (volumen). · *Métrica:* CVR de PDP. · *Dependencia Fenicio:* Baja.

2. **Arreglar el buscador y su página de "sin resultados".**
   - *Qué:* activar tolerancia a errores/sinónimos y rediseñar la página de cero resultados con sugerencias, productos y categorías.
   - *Por qué:* "remra" → 0 resultados en un callejón sin salida (H3); pierde compradores de alta intención.
   - *Dónde:* buscador (`/catalogo?q=`).
   - *Responsable:* Fenicio (soporte) + Front-end. · *Complejidad:* Media. · *Métrica:* % de búsquedas sin resultados. · *Dependencia Fenicio:* Alta (validar).

3. **Clarificar el sistema de precios.**
   - *Qué:* en tarjetas mostrar venta + tachado + %OFF + "BBVA desde $X" (no 4 números crudos).
   - *Por qué:* hoy hay 3–4 cifras sin etiqueta (H5); genera confusión y diluye el descuento.
   - *Dónde:* tarjetas de listados y home.
   - *Responsable:* Front-end. · *Complejidad:* Baja/Media. · *Métrica:* CTR tarjeta→PDP y CVR. · *Dependencia Fenicio:* Media.

4. **Sanear la confianza formal.**
   - *Qué:* email de marca (`@glassywaves.com.uy`), publicar RUT/identidad, revisar con asesoría la política de "no devoluciones de dinero" y unificar inconsistencias (locales/plazos).
   - *Por qué:* Gmail + sin RUT + no-devoluciones elevan ansiedad y riesgo legal (H18).
   - *Dónde:* footer y páginas institucionales.
   - *Responsable:* Ops/Legal/Contenido. · *Complejidad:* Baja. · *Métrica:* CVR y reclamos. · *Dependencia Fenicio:* Baja.

5. **Habilitar zoom y agrandar áreas táctiles en móvil.**
   - *Qué:* quitar `user-scalable=no`/`maximum-scale=1` y llevar talles/botón a ≥44px.
   - *Por qué:* público mobile-first con zoom bloqueado y targets de 30px (H12); barrera de accesibilidad y de compra.
   - *Dónde:* meta viewport + CSS de la plantilla.
   - *Responsable:* Front-end. · *Complejidad:* Baja. · *Métrica:* CVR móvil. · *Dependencia Fenicio:* Baja/Media.

6. **Introducir un umbral de envío gratis con barra de progreso.**
   - *Qué:* definir monto sobre margen/AOV y comunicarlo ("Te faltan $X para envío gratis").
   - *Por qué:* no hay envío gratis (H11); es palanca de ticket y anti-abandono estándar en la competencia.
   - *Dónde:* reglas de envío + mini-cart/checkout.
   - *Responsable:* Ops + Fenicio. · *Complejidad:* Media. · *Métrica:* AOV y abandono de carrito. · *Dependencia Fenicio:* Media.

7. **Sumar prueba social (reseñas con foto).**
   - *Qué:* integrar reseñas y mostrar estrellas en PDP y tarjetas; pedirlas postcompra.
   - *Por qué:* no hay reseñas ni UGC (H7); es el mayor reductor de incertidumbre en moda.
   - *Dónde:* PDP y grilla + email postcompra.
   - *Responsable:* Marketing/Integración. · *Complejidad:* Media. · *Métrica:* CVR y nº de reseñas. · *Dependencia Fenicio:* Media/Alta (validar).

8. **Mejorar filtros y ordenamiento en los listados.**
   - *Qué:* exponer filtros de talle/color y un selector de orden.
   - *Por qué:* con 100+ ítems solo se filtra por precio y no hay orden (H4); descubrimiento lento.
   - *Dónde:* páginas de categoría/catálogo.
   - *Responsable:* Fenicio + Front-end. · *Complejidad:* Media. · *Métrica:* productos vistos/sesión y add-to-cart. · *Dependencia Fenicio:* Media/Alta.

9. **Activar captación de leads + carrito abandonado.**
   - *Qué:* pop-up con incentivo (ej. 10% primera compra) e integrar email/automation (bienvenida, carrito abandonado, postcompra).
   - *Por qué:* newsletter sin incentivo y sin flujos visibles (H19); se pierde recompra y recuperación.
   - *Dónde:* sitio + herramienta de email.
   - *Responsable:* Marketing/Integración. · *Complejidad:* Media. · *Métrica:* leads/mes e ingresos por email. · *Dependencia Fenicio:* Media (conector).

10. **Instrumentar la analítica antes de escalar.**
    - *Qué:* GA4 con eventos de embudo, Search Console, PageSpeed/CrUX y analítica de checkout.
    - *Por qué:* varias decisiones son hoy hipótesis; sin datos no se prioriza ni se miden los tests (Sección 17).
    - *Dónde:* todo el sitio (capa de medición).
    - *Responsable:* Data/Marketing. · *Complejidad:* Media. · *Métrica:* cobertura de eventos y disponibilidad de embudo. · *Dependencia Fenicio:* Media (inserción de scripts/GTM).

---

*Documento generado el 2026-07-13 por D&C Scale Partners. Observaciones "verificadas" basadas en navegación pública real; "hipótesis" requieren datos internos (Sección 17). No se completó ninguna compra ni se accedió a áreas privadas.*
