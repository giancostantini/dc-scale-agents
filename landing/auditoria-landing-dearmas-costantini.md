# Auditoría de la landing de Dearmas Costantini

**Fecha de la auditoría:** 11 de septiembre de 2026.

## Conclusión ejecutiva

**La landing tiene una identidad aprovechable y una propuesta comercial con potencial, pero hoy comunica mejor la intención de ser una firma premium que la evidencia de serlo.**

El salto hacia una experiencia de agencia/product studio de alto nivel debería apoyarse en cuatro cosas:

1. **Una propuesta de valor más concreta y fácil de entender.**
2. **Casos y demostraciones que hagan visible la calidad del trabajo.**
3. **Un recorrido más corto, con mejor jerarquía comercial.**
4. **Interacciones precisas, accesibles y confiables.**

Antes de incorporar más efectos, hay problemas que resolver: una suscripción al newsletter que no se guarda, discrepancias entre el chat y la página, afirmaciones comerciales ambiguas, contrastes insuficientes y varios detalles de implementación que afectan la experiencia.

### Alcance y metodología

Revisé:

- La landing completa: HTML, CSS, JavaScript, imágenes, logos y configuración de despliegue.
- Las páginas de privacidad y términos.
- La estructura del monorepo y su documentación.
- Los endpoints del dashboard conectados con la landing: captación de leads, chat y webhook de Calendly.
- La metodología interna, como posible fuente de contenido diferencial.
- El contenido público de `dearmascostantini.com` y algunas respuestas HTTP.

**Limitación de esta auditoría:** pude inspeccionar código, contenido e imágenes individuales, pero no tuve una sesión de navegador controlable para renderizar la web y probarla visualmente en distintos tamaños. No ejecuté la web localmente ni medí Lighthouse/Core Web Vitals. Los riesgos de responsive y movimiento que describo son conclusiones derivadas del código.

**La auditoría original se realizó sin modificar archivos ni implementar cambios. Este documento es su exportación a Markdown.** Las rutas de referencia son relativas a la raíz del monorepo.

---

## A. Cómo está construida actualmente

### 1. Stack real

| Capa | Implementación actual |
|---|---|
| Frontend de la landing | HTML, CSS y JavaScript vanilla |
| Organización | Un único `index.html` contiene estructura, estilos y comportamiento |
| Build | No hay proceso de build propio |
| Hosting | Vercel, como sitio estático independiente |
| Tipografía | Google Fonts: Inter y DM Sans |
| Animación | CSS, `IntersectionObserver` y `requestAnimationFrame` |
| Reserva de reuniones | Widget oficial de Calendly |
| Captación de leads | API del dashboard → Supabase |
| Chat | API del dashboard → Anthropic, con respuesta en streaming |
| Páginas adicionales | Privacidad y términos, también en HTML estático |

El dashboard del monorepo utiliza **Next.js 16, React 19, TypeScript y Supabase**, pero esas dependencias no forman parte del frontend de la landing.

La landing no utiliza actualmente GSAP, Framer Motion, Three.js, un framework de componentes ni una librería de UI.

**Esto es una buena base para rendimiento:** el nivel de interacción que buscás es compatible con una web estática bien estructurada.

### 2. Estructura de carpetas

Dentro de `landing/`:

- `index.html`: página principal.
- `privacidad.html` y `terminos.html`: páginas legales.
- `photos/`: retratos utilizados de los socios.
- `logos/`: logos de clientes y algunos archivos originales/duplicados.
- `flags/`: banderas utilizadas en los casos.
- Favicons.
- `vercel.json`: URLs limpias y configuración de trailing slash.
- `README.md`: documentación breve, parcialmente desactualizada.

En el resto del workspace:

- `dashboard/`: sistema interno, portal y APIs utilizadas por la landing.
- `scripts/`: agentes y automatizaciones.
- `vault/`: conocimiento, metodología y contexto operativo.
- `.github/workflows/`: ejecución de los jobs.
- `kickoff/`: otra página estática independiente.
- `docs/`: documentación y auditorías del sistema.

### 3. Organización del código

`landing/index.html` tiene **5.737 líneas** y aproximadamente **192 KB sin comprimir**, según el archivo versionado.

Contiene:

- Un bloque extenso de comentarios sobre versiones anteriores.
- Cerca de 3.900 líneas de CSS.
- El HTML completo.
- Un bloque final de JavaScript de unas 650 líneas.

Los “componentes” son patrones de clases, por ejemplo:

- `.btn`, `.btn-primary`, `.btn-ghost`.
- `.case`, `.partner`, `.model`, `.step`.
- `.sol-tabs`, `.sol-panel`, `.sol-phone`.
- `.inline-cta`.
- `.prebook-modal`.
- `.chat-window`.

Hay una base de diseño mediante variables CSS para colores, radios, sombras y transiciones. Sin embargo, **la reutilización es visual, no estructural**: se repite markup y se mantiene todo dentro de un archivo.

### 4. Secciones actuales, en su orden real

| Sección | Cómo está armada | Evaluación |
|---|---|---|
| Cabecera | Banner fijo de disponibilidad, navegación fija, menú móvil | Facilita el contacto, pero concentra demasiados elementos |
| Hero | Titular grande, explicación, dos CTAs, prueba breve y cuatro indicadores | Jerarquía inicial reconocible; propuesta todavía amplia |
| Nuestra firma | Dos columnas, posicionamiento y cita propia | Repite argumentos del hero |
| “La pregunta” | Frase sobre crecer 30% y otro CTA | Mucho protagonismo para una afirmación poco contextualizada |
| Soluciones | Dos tabs: Growth & Marketing / Automatizaciones con IA | Buena intención de explicar mediante una interfaz |
| Casos | Tres tarjetas con logos, métricas, textos y referencias | Falta profundidad y evidencia visual |
| Valores | Tres tarjetas numeradas | Correctos, pero genéricos y repetitivos |
| Cupos | Ocho posiciones, cinco ocupadas y tres disponibles | Explica capacidad limitada; ocupa demasiado espacio |
| Skin in the game | Gran titular, explicación del variable y tres argumentos | Diferencial comercial interesante, con ambigüedades |
| Proceso | Cuatro tarjetas de etapas y duración | Ayuda a reducir incertidumbre; tiene un problema de contraste |
| Modelo comercial | Dos tarjetas de modalidades | Información importante que llega bastante tarde |
| Socios | Dos tarjetas, fotografías pequeñas, biografías y LinkedIn | Aporta cercanía; está visualmente subaprovechado |
| FAQ | Ocho acordeones | Temas relevantes, implementación poco accesible |
| CTA final | Cierre comercial y botón de agenda | Coherente con el objetivo |
| Footer | Newsletter, navegación, redes y emails | Completo en apariencia, con funcionalidades incompletas |

A esto se suman el chat flotante y el formulario previo a Calendly.

**Importante:** los comentarios históricos hablan de seis tabs y de Soluciones al final de la página. La implementación actual tiene **dos tabs y Soluciones antes de Casos**. Para rediseñar, hay que partir del HTML efectivo.

### 5. Integraciones comerciales

El recorrido actual es:

**CTA → formulario previo → envío del lead al dashboard → Calendly → webhook de reserva.**

El formulario pide nombre, email, empresa y motivo. El chat utiliza otra API del mismo dashboard.

Es una infraestructura valiosa para conservar, aunque necesita una revisión de confiabilidad y medición.

---

## B. Qué funciona bien

### Identidad con posibilidades de evolución

La combinación de **verde profundo, marfil y arena** puede comunicar una firma boutique: sobriedad, cercanía y criterio. Es una base diferenciable si se desarrolla con buena dirección de arte.

### Objetivo comercial reconocible

La acción principal es consistente: **agendar una conversación de 30 minutos**. El usuario no tiene que elegir entre muchos tipos de conversión.

### Diferenciales potencialmente fuertes

Hay argumentos que sí pueden sostener una propuesta premium:

- Participación de los socios.
- Capacidad limitada.
- Ejecución directa.
- Marketing y automatización bajo una misma dirección.
- Modalidad variable vinculada a objetivos para el camino digital.
- Sistemas propios e integración con la operación del cliente.

### Existen nombres y activos concretos

Hay clientes identificados, enlaces a sus sitios, fotografías de los fundadores y perfiles de LinkedIn. Esto aporta más que una landing completamente abstracta.

### Hay intención de explicar el servicio

Los mockups de Soluciones son un primer paso hacia mostrar qué se entrega. El ejemplo del agente comercial es especialmente aprovechable porque describe una situación de uso.

### Base técnica ligera

No hay hidratación de una aplicación completa ni dependencias visuales pesadas. La respuesta pública consultada llegó desde Vercel con **compresión Brotli y cache HIT**.

### Consideración inicial de accesibilidad y errores

Existen:

- Preferencia de movimiento reducido.
- Labels en el formulario principal.
- Nombres accesibles en varios botones.
- Cierre con Escape en menú y modal.
- Fallback a una ventana de Calendly.
- Mensajes de error del chat con una salida hacia la reunión.

Son buenos puntos de partida, aunque todavía incompletos.

---

## C. Qué funciona mal

### 1. La credibilidad tiene inconsistencias visibles

#### Resultados y objetivos están mezclados

En el hero aparece **“+30% Mundipack”** junto a otros indicadores. Más abajo, el caso explica que ese porcentaje es un **objetivo de ventas** y que el proyecto está en implementación.

Un usuario puede interpretar el indicador del hero como un resultado ya obtenido.

Además, la introducción a Casos afirma que no se muestran proyecciones, mientras uno de los casos presenta justamente un objetivo.

Referencias: `landing/index.html:4299`, `landing/index.html:4454` y `landing/index.html:4517`.

#### Hay testimonios pendientes de validación documental

El `README.md` marca los testimonios como placeholders editoriales a confirmar. Dos de esas citas siguen en el HTML.

No puedo determinar si fueron autorizadas posteriormente, pero **el proyecto no deja esa validación resuelta**. Es prioritario confirmarlo antes de utilizarlas como prueba social.

Referencia: `landing/README.md:16`.

#### El chat cuenta otra versión de la empresa

| Tema | Landing | Prompt del chat |
|---|---|---|
| Cupos | 3 | 2 |
| Glassy Waves | Ventas duplicadas respecto al último año | +180% en seis meses |
| Wiz Trip | Marca lanzada desde cero; bandera de EE. UU. | 3× conversión; Uruguay |
| Caso IA | Mundipack, en implementación | Retail bajo NDA con 60% de consultas resueltas |

Estas discrepancias están en el código del chat; no hice una consulta al modelo para comprobar qué respondería.

Referencia: `dashboard/app/api/chat/route.ts:85–99`.

### 2. La promesa de cobro puede interpretarse incorrectamente

El hero dice **“cobramos si crecés”**. Después se aclara que:

- Existe un fee estructural aunque no haya crecimiento.
- Lo condicionado es el success fee.
- El camino IA tiene instalación y mantenimiento, sin esa misma condición.

También se repite “solo por el 2%”, aunque la estructura real incluye fee fijo y un variable del 2–4%.

**El diferencial comercial es válido; la síntesis actual simplifica demasiado sus condiciones.**

### 3. Se repite mucho el posicionamiento y se demuestra poco

Hero, Nuestra firma, Valores, Skin in the game, Socios y CTA final repiten ideas similares:

- Somos socios.
- Ejecutamos.
- No vendemos slides.
- Estamos involucrados.
- Nos responsabilizamos.

Mientras tanto, falta mostrar con profundidad:

- Qué se construyó.
- Cómo cambió una operación.
- Qué recibió el cliente.
- Qué decisión produjo una mejora.
- Qué resultado está medido y en qué período.

### 4. El lenguaje visual se vuelve repetitivo

Predominan:

- Titulares grandes.
- Una palabra en arena.
- Bajadas de texto.
- Tarjetas redondeadas.
- Numeración.
- Otro CTA.

Eso puede funcionar como diseño corporativo contemporáneo, pero **no alcanza por sí solo para transmitir el nivel de un product studio premium**.

### 5. Hay funciones que parecen terminadas y no lo están

- El newsletter confirma una suscripción sin enviar ni guardar el email.
- El enlace “Modelo” del footer apunta a `#caminos`, un ID que ya no existe.
- El formulario previo no muestra errores cuando faltan datos.
- Su email se valida en backend, pero el frontend solo comprueba que no esté vacío.
- Los fallos al guardar el lead quedan en consola; el usuario continúa al calendario.

Referencias: `landing/index.html:4966`, `landing/index.html:5132–5164` y `landing/index.html:5710–5732`.

### 6. La calidad del detalle técnico es irregular

Encontré, por análisis del CSS:

- Títulos de Proceso claros sobre tarjetas blancas.
- Tooltips de cupos posicionados fuera de elementos que tienen `overflow: hidden`, por lo que quedan recortados.
- Reglas de reveal que sobreescriben el desplazamiento de hover de varias tarjetas.
- Parallax que reemplaza el `transform` usado para centrar algunos glows.
- Cambios de espaciado no intencionales en la navegación móvil al hacer scroll.

Son detalles pequeños individualmente, pero acumulados reducen la sensación de precisión.

---

## D. Problemas prioritarios

| Prioridad | Problema | Por qué importa |
|---|---|---|
| **P0 — Confianza** | Separar resultados obtenidos, objetivos y ejemplos ilustrativos | La credibilidad es central en una contratación B2B |
| **P0 — Confianza** | Alinear chat, casos, cupos y documentación | El sitio debe contar una única versión |
| **P0 — Conversión** | Resolver la falsa confirmación del newsletter | Hoy se pierde la suscripción mientras se comunica éxito |
| **P0 — Accesibilidad** | Corregir contraste y acceso por teclado a interacciones esenciales | Hay contenido y controles difíciles de utilizar |
| **P1 — Conversión** | Revisar formulario, errores y registro de leads | Evitar pérdidas silenciosas y fricción antes de reservar |
| **P1 — Mensaje** | Aclarar fee fijo, variable, objetivos y modalidad IA | Reducir expectativas incorrectas |
| **P1 — UX** | Reducir repetición y adelantar pruebas concretas | Mejorar comprensión y ritmo de lectura |
| **P1 — Responsive** | Resolver estados intermedios, tamaños pequeños y overlays | Hay riesgos concretos por cascada y dimensiones |
| **P2 — Técnica/SEO** | Modularizar, limpiar código histórico y completar metadatos | Facilitar una evolución mantenible |
| **P2 — Diseño** | Incorporar interacciones distintivas | Tiene sentido sobre una base comercial y funcional sólida |

P0 indica prioridad de resolución, no una afirmación de que toda la web esté inutilizable.

---

## E. Oportunidades visuales

### 1. Mantener la paleta, precisar su uso

Hoy `--emerald` y `--sand` tienen exactamente el mismo valor: `#C4A882`. Aunque los comentarios describen dos acentos diferentes, en la implementación no existe esa distinción.

Conviene definir roles claros:

- Fondo principal.
- Superficies secundarias.
- Texto principal y secundario.
- Acción.
- Acento editorial.
- Estados.

La disponibilidad podría comunicarse con más sobriedad. Los puntos rojos pulsantes y la insistencia en los cupos acercan algunas zonas a una landing de urgencia comercial.

### 2. Mejorar la jerarquía tipográfica

Inter funciona bien para lectura y UI. DM Sans aparece principalmente en numeraciones y el ampersand.

El problema principal es de uso:

- Muchos titulares tienen un peso visual similar.
- Hay etiquetas de 8–11 px.
- Se combina tamaño pequeño con tracking amplio y contraste limitado.
- Abundan los saltos de línea manuales.
- Los textos comerciales compiten con las cifras.

Propondría una escala más selectiva: **un hero dominante, dos o tres momentos editoriales y secciones de lectura más contenidas**.

### 3. Diseñar distintos ritmos de composición

El espaciado actual utiliza principalmente 120 px verticales y 80 px laterales en desktop, con cambios generales a 72/24 px.

Hay aire, pero no siempre está vinculado a la importancia del contenido.

Mejoraría:

- Un contenedor máximo coherente.
- Diferentes densidades según la función de cada sección.
- Composiciones asimétricas.
- Bloques visuales amplios para proyectos.
- Secciones breves para objeciones o datos secundarios.

### 4. Dar protagonismo al trabajo

La oportunidad visual más importante es reemplazar parte del texto por:

- Capturas reales del producto o dashboard.
- Creatividades seleccionadas.
- Flujos de automatización comprensibles.
- Comparaciones de procesos antes/después.
- Resultados con período y contexto.

El mockup actual muestra **ROAS +32×, ventas de US$84k y otras métricas sin identificar fuente ni aclarar que son ilustrativas**. Una demo debería diferenciar claramente ejemplo y evidencia.

### 5. Mejorar la presencia de los socios

Las fotografías existen, pero se muestran en círculos de 72 px. Además, difieren en iluminación, encuadre y vestimenta.

Una dirección fotográfica consistente, con mayor presencia y biografías basadas en experiencia concreta, aportaría bastante más autoridad.

---

## F. Oportunidades de UX

### Qué probablemente entiende alguien en los primeros cinco segundos

Como evaluación heurística, la primera impresión sería:

> “Es una firma que ayuda a crecer, trabaja con pocos clientes y quiere que agende una reunión.”

Queda menos claro:

- Qué hace específicamente.
- Para qué tipo y tamaño de empresa.
- Qué problemas resuelve primero.
- Qué significa “socio” en términos prácticos.
- Si el servicio relevante para mí es marketing, tecnología o ambos.

El hero debería responder:

**Qué hacemos + para quién + cómo intervenimos + una prueba + siguiente paso.**

### Mejoras del recorrido comercial

#### Mostrar antes el encaje

La segmentación “online versus offline” es demasiado rígida. Un e-commerce también puede necesitar automatización operativa.

Organizaría la oferta por necesidades:

- **Crecer ventas y mejorar adquisición/conversión.**
- **Eliminar trabajo manual y mejorar la operación comercial.**

#### Unificar expectativas de la reunión

El hero habla de reunirse con “uno de los socios”. Otras secciones prometen a ambos juntos.

También se alternan:

- Agendar 30 minutos.
- Agendar reunión.
- Agendar diagnóstico.

Conviene que cada etiqueta corresponda a la misma acción y a lo que realmente sucede después.

#### Revisar el paso previo a Calendly

El modal anuncia “tres datos rápidos”, pero exige cuatro campos.

Además:

- Todos son obligatorios.
- No hay feedback por campo.
- No queda explícito en ese punto qué sucede con los datos.
- El usuario atraviesa dos interfaces antes de confirmar.

Recomiendo diseñar una sola experiencia de reserva coherente, con contexto mínimo y errores claros. La reserva confirmada y el lead captado deben ser estados diferenciados.

#### Aportar información útil para decidir

Falta aclarar mejor:

- Condiciones mínimas de encaje.
- Cómo se define y mide el crecimiento.
- Base de cálculo del variable.
- Si la inversión publicitaria está aparte.
- Alcance y eventual costo del diagnóstico.
- Entregables iniciales.
- Propiedad y continuidad de los sistemas.
- Cuándo se espera una primera señal de progreso.

La FAQ sobre precio promete un “rango de referencia”, pero no incluye un rango. Conviene resolver esa respuesta con información concreta o criterios explícitos.

### Responsive: evaluación por tamaño

| Entorno | Preparación actual | Riesgos / mejoras |
|---|---|---|
| Desktop amplio | Grids de varias columnas y títulos fluidos | Falta un máximo de ancho consistente para evitar composiciones demasiado extendidas |
| Laptop | Conserva casi todo el diseño desktop | Casos y Proceso pueden quedar densos; navegación cerca de 900 px necesita prueba específica |
| Tablet | A ≤1100 px Soluciones se apila; a ≤900 px casi todos los grids pasan a una columna | Adaptación abrupta y recorrido innecesariamente largo en tablets |
| Mobile | Menú hamburguesa, CTAs anchos, tarjetas apiladas, cupos adaptativos | Riesgos en mockups, textos con anchos mínimos, formularios y teclado virtual |

#### Riesgos concretos detectados

- **Navegación móvil:** `.nav.scrolled` conserva `padding: 12px 48px` y tiene mayor especificidad que la regla móvil `.nav`. Al hacer scroll puede cambiar bruscamente la alineación.
- **CTAs pequeños:** `.inline-cta-text` mantiene `min-width: 280px`, incompatible con el espacio interior de algunas tarjetas en teléfonos estrechos.
- **Tabs desktop:** el primer panel determina la altura; el segundo se superpone con posición absoluta. Un contenido más alto puede recortarse.
- **Mockup IA móvil:** el teléfono se reduce hasta 190 px, mantiene texto pequeño y utiliza overflow oculto. Hay riesgo de perder parte de la conversación.
- **Chat y modal:** utilizan `vh`, sin tratamiento específico de viewport dinámico, teclado y safe areas.
- **Banner:** su altura puede variar por wrapping, mientras la posición de la navegación usa un offset fijo.

Referencias: `landing/index.html:442`, `landing/index.html:2796`, `landing/index.html:3516–3546` y `landing/index.html:3962–4153`.

---

## G. Oportunidades técnicas

### 1. Arquitectura y mantenimiento

Recomiendo una **arquitectura estática por componentes**, con contenido, estilos e interacciones separados.

El valor sería:

- Mantener encabezado y footer una sola vez.
- Reutilizar componentes accesibles.
- Centralizar servicios, casos, cupos y condiciones comerciales.
- Compartir esa información con el chat.
- Separar efectos visuales del flujo de captación.
- Eliminar CSS de secciones y mockups que ya no existen.

El monorepo ya tiene sistemas y metodología propios. Esa base puede alimentar contenido diferencial; la landing no debería depender de copiar manualmente distintas versiones del mismo dato.

### 2. Performance

#### Imágenes

Pesos aproximados de archivos utilizados:

| Archivo | Peso |
|---|---:|
| `photos/federico.jpg` | 70 KB |
| `photos/gianluca.jpg` | 37 KB |
| `logos/mundipack.png` | 45 KB |
| `logos/glassy.svg` | 6 KB |
| `logos/wiztrip.svg` | 4 KB |

**No hay un problema evidente de fotografías gigantes cargadas en la página.**

Sí hay margen de mejora:

- No se utiliza `loading="lazy"`.
- No hay `srcset` ni `sizes`.
- Las fotos son bastante mayores que sus avatares.
- Faltan dimensiones HTML en varias imágenes, aunque algunos contenedores CSS ya reservan espacio.
- El logo raster de Mundipack merece una versión de mejor calidad.

Existe un original de unos **7,9 MB** en `logos/foto linkedin gian.jpg`, pero no está referenciado por la landing. Es limpieza de repositorio, no peso de carga inicial actual.

#### Fuentes

Se solicitan dos familias y múltiples pesos mediante Google Fonts.

Hay `preconnect` y `display=swap`, lo cual ayuda. Revisaría:

- Pesos realmente utilizados.
- Una entrega más compacta.
- Alojamiento local de WOFF2.
- Métricas de fallback para reducir movimientos del texto.

#### JavaScript y terceros

El JavaScript propio es relativamente acotado. El widget y CSS de Calendly se cargan desde el inicio, aunque el usuario no vaya a reservar.

Tiene sentido cargar la integración al mostrar intención de agenda, conservando una salida funcional.

#### Animaciones efectivamente activas

Los blobs, auroras, sweeps y glows complejos del hero están desactivados al final del CSS:

`landing/index.html:4156–4166`.

Por eso no corresponde atribuirles consumo de renderizado actual. Sí permanece su código descargado y procesado.

Los puntos a revisar son:

- Grilla animada mediante `background-position`.
- Fondo global que cambia de color.
- Uso amplio de `will-change`.
- Reveal sobre secciones completas y sus hijos.
- Dos callbacks de scroll coordinados por rAF por separado.
- Lecturas y escrituras de geometría en parallax.

#### Core Web Vitals: riesgos, no mediciones

| Métrica | Riesgo identificado |
|---|---|
| LCP | El contenido principal comienza oculto y aparece mediante animación; fuentes y CSS externos pueden retrasar su presentación |
| CLS | Cambio de fuente y espacios no reservados de forma uniforme |
| INP / fluidez | Repaints del fondo, animación de grilla, trabajo de scroll y reconstrucción del mensaje durante streaming |

No hay base para afirmar un puntaje actual sin medir en navegador.

### 3. SEO técnico

**Ya existe:**

- Idioma español.
- Un H1.
- Title y descripción.
- Metadatos Open Graph básicos.
- Contenido HTML disponible sin esperar a una API.
- URLs limpias.
- HTTPS.

**Falta o mejoraría:**

- Canonical.
- `og:url` y `og:image`.
- Metadatos para tarjetas sociales.
- Datos estructurados de organización y servicios, ajustados al contenido real.
- Páginas propias de casos y, si hay profundidad suficiente, de servicios.
- Títulos más específicos para búsquedas de marketing y automatización.

Comprobé que **`/robots.txt` y `/sitemap.xml` devuelven 404**. Esto no impide por sí solo la indexación, pero conviene completar ambos.

El dominio sin `www` redirige con **307** hacia `www`. Si esa es la elección definitiva, revisaría una redirección permanente y la consistencia con el canonical.

### 4. Accesibilidad

#### Contraste

Calculé estas relaciones a partir de los colores declarados:

| Combinación | Contraste | Evaluación |
|---|---:|---|
| Arena `#C4A882` sobre marfil `#F5F2EC` | **2,03:1** | Insuficiente incluso para texto grande |
| Arena sobre blanco | **2,27:1** | Insuficiente incluso para texto grande |
| Muted `#7A8A7E` sobre marfil | **3,26:1** | Insuficiente para texto normal |
| Sand-deep `#9B8259` sobre marfil | **3,28:1** | Insuficiente para etiquetas pequeñas |
| Lino `#E8E4DC` sobre blanco | **1,27:1** | Muy insuficiente |
| Verde oscuro sobre botón arena | **7,95:1** | Buen contraste |

El caso de Proceso es concreto: la sección declara texto lino, las tarjetas son blancas y `.step-title` no redefine su color. Esa herencia produce la combinación de **1,27:1**.

Referencias: `landing/index.html:1279`, `landing/index.html:1809–1832` y `landing/index.html:4698`.

El fondo interpolado exige otra revisión: cambia para todo el viewport, mientras el color del texto permanece fijo por sección. El algoritmo interpola entre los inicios de las secciones; no limita automáticamente el cambio a una franja vacía entre ellas.

#### Semántica y teclado

- La página principal no tiene `<main>` ni enlace para saltar al contenido.
- Varias FAQ son `div` con click, sin control equivalente por teclado.
- Los cupos disponibles también son `div` clickeables.
- Hay enlaces de agenda sin `href`.
- Los tabs tienen roles iniciales, pero faltan asociaciones y navegación de teclado completa.
- Menú, chat y modal se ocultan visualmente sin retirar de forma completa sus controles del recorrido de foco.
- El modal no contiene ni devuelve el foco de manera explícita.
- Falta un tratamiento consistente de `:focus-visible`.

Además, sin JavaScript y con movimiento normal, gran parte del contenido permanece con `opacity: 0`. **La animación debería mejorar contenido ya accesible, no ser requisito para verlo.**

### 5. Confiabilidad del funnel

El backend ofrece una base útil: validación, límites básicos, deduplicación inicial y webhook firmado.

Mejoraría:

- Confirmación verificable del guardado del lead.
- Atribución de origen, campaña y servicio de interés.
- Email en un campo estructurado, en lugar de buscarlo dentro de notas.
- Idempotencia del booking.
- Manejo de cancelaciones y reprogramaciones.
- Validación de zona horaria.
- Estados de envío y prevención de solicitudes simultáneas en el chat.

El código actual guarda los leads como `source: "manual"` y `type: "gp"`, incluso cuando podrían venir por automatización. Tampoco encontré instrumentación propia de eventos o captura de UTM en la landing.

La existencia del webhook no demuestra que esté configurado en producción; eso requiere validación operativa.

---

## H. Ideas de interactividad

### Qué tan interactiva es hoy

Actualmente tiene:

- Entrada escalonada del hero.
- Reveal al entrar y salir del viewport.
- Grilla animada.
- Parallax decorativo.
- Fondo ligado al scroll.
- Navegación que se condensa y marca sección.
- Barra de progreso.
- Tabs.
- FAQ.
- Hovers.
- Chat en streaming.
- Modal y Calendly.

**Ya hay bastante movimiento. Falta que una mayor proporción de ese movimiento explique el trabajo.**

### Oportunidades para la versión 2.0

| Recurso | Aplicación con sentido |
|---|---|
| Animaciones de entrada | Revelar una vez los elementos importantes, con el mensaje disponible inmediatamente |
| Scroll storytelling | Mostrar cómo un problema comercial pasa a diagnóstico, sistema y resultado |
| Sticky sections | Mantener una demo visible mientras cambia una explicación breve |
| Microinteracciones | Estados claros de botón, validación, envío, selección y confirmación |
| Hover | Previsualizar un proyecto o destacar una capacidad concreta |
| Texto animado | Dar énfasis a una frase breve en un momento editorial |
| Cambios de background | Marcar capítulos con superficies que mantengan contraste controlado |
| Cards interactivas | Abrir casos con contexto, entregables y evidencia |
| Parallax | Profundidad ligera en una composición puntual |
| Reacción al cursor | Iluminación o desplazamiento mínimo en el hero, solo en dispositivos con puntero preciso |
| Scroll horizontal | Galería de trabajo si el material justifica exploración; con controles y alternativa vertical |
| 3D / WebGL | Solo si representa un sistema o interacción de forma más clara que una solución 2D |

### Los tres momentos que priorizaría

**1. Hero con una firma visual propia**

Una composición que conecte crecimiento comercial y sistemas: datos, decisiones y ejecución. Podría aprovechar el ampersand de la marca como elemento articulador.

**2. Una demostración central de “así trabajamos”**

Por ejemplo, el usuario recorre:

- Una consulta comercial.
- El contexto que recupera el sistema.
- La acción sugerida.
- El seguimiento visible en el dashboard.

Debe quedar identificado si se trata de una demo ilustrativa.

**3. Un caso contado mediante scroll**

Pocos pasos, con evidencia:

**Situación inicial → intervención → entregable → resultado medido.**

En mobile, lo convertiría en una secuencia vertical natural.

El objetivo sería que el visitante termine pensando **“entiendo qué construyen y veo el nivel”**.

---

## I. Elementos que mantendría

- La base cromática verde profundo, marfil y arena.
- Los nombres de los socios y el enfoque boutique.
- Las dos capacidades: crecimiento digital y automatización.
- La ejecución directa como argumento.
- La idea de capacidad limitada, comunicada con menor insistencia.
- La estructura comercial, una vez aclaradas sus condiciones.
- Los clientes y activos que cuenten con validación.
- La conversación inicial como conversión principal.
- Los emails y enlaces profesionales.
- La infraestructura de leads y reservas, reforzada.
- La salida estática y el JavaScript selectivo.
- El soporte de movimiento reducido.

---

## J. Elementos que rehacería

| Elemento | Decisión |
|---|---|
| Hero | Reescribir y recomponer para explicar actividad, cliente ideal y diferencia |
| Casos | Rediseño completo, con evidencia y mayor protagonismo visual |
| Soluciones | Convertirlas en demostraciones más específicas y comprensibles |
| Proceso | Basarlo en entregables reales y corregir accesibilidad |
| Socios | Nueva composición, mejores retratos y credenciales concretas |
| Formulario + agenda | Rediseñar como un flujo comercial coherente |
| FAQ | Reescribir respuestas evasivas y rehacer controles accesibles |
| Sistema de motion | Simplificar y vincular al contenido |
| Arquitectura del frontend | Modularizar y depurar código histórico |
| Chat | Actualizar conocimiento, estados y oportunidad de aparición |

### Reduciría o eliminaría

- “La pregunta” como sección independiente.
- Valores como bloque extenso separado.
- Repeticiones sobre slides, agencias y ejecución.
- La sección de cupos en su dimensión actual.
- Pulsos permanentes en múltiples elementos.
- Cifras ilustrativas que parecen resultados.
- Newsletter mientras no exista una operación real de suscripción y envío.
- CSS, comentarios y recursos de variantes abandonadas.

---

## K. Plan recomendado para una versión 2.0

### Fase 1 — Definición comercial y validación de evidencia

Resolver:

- Cliente ideal.
- Peso relativo de Growth y Automatización.
- Diferenciales demostrables.
- Condiciones comerciales.
- Métricas, testimonios y material publicable.
- Qué sucede realmente en la primera reunión.

**Resultado:** una fuente única de contenido aprobado para la landing y el chat.

### Fase 2 — Arquitectura de información

Recomiendo este recorrido:

1. **Hero:** qué hacen, para quién y con qué diferencia.
2. **Prueba temprana:** clientes y una evidencia verificable.
3. **Dos capacidades:** crecer ventas / mejorar operación.
4. **Casos seleccionados:** trabajo, contexto y resultados.
5. **Cómo trabajan:** método y entregables.
6. **Socios:** quién responde por la ejecución.
7. **Modelo y encaje:** condiciones esenciales.
8. **FAQ breve.**
9. **Contacto / agenda.**

La disponibilidad puede integrarse en el cierre.

### Fase 3 — Dirección de arte y sistema visual

Definir:

- Contenedores y grilla.
- Escala tipográfica.
- Roles de color con contraste validado.
- Fotografía.
- Lenguaje de casos y demos.
- Componentes y estados.
- Comportamiento responsive.

**Resultado:** diseño de las secciones principales en desktop y mobile.

### Fase 4 — Prototipo de interacción

Probar los tres momentos prioritarios:

- Hero.
- Demo/caso.
- Proceso.

Evaluar si ayudan a comprender, cuánto tiempo exigen y cómo se adaptan a touch y movimiento reducido.

### Fase 5 — Implementación e integraciones

Una vez aprobado el diseño:

- Componentización.
- Optimización de recursos.
- Semántica y teclado.
- Agenda y registro de leads.
- Chat con información consistente.
- SEO técnico.
- Analítica del recorrido comercial.

### Fase 6 — Validación antes del lanzamiento

Probar al menos:

- 320, 360, 390, 768, 1024, 1366, 1440 y 1920 px.
- Safari/iOS y Chrome/Android.
- Teclado, zoom al 200% y movimiento reducido.
- Formularios con errores y fallos de conexión.
- Calendly, booking y actualización del pipeline.
- Fluidez de scroll y carga con red/dispositivo limitado.

Objetivos de rendimiento para validar, no métricas actuales:

- **LCP ≤ 2,5 s.**
- **INP ≤ 200 ms.**
- **CLS ≤ 0,1.**

### Fase 7 — Medición comercial

Medir el recorrido completo:

**Visita → CTA → inicio de reserva → lead guardado → reunión confirmada → oportunidad calificada.**

Esto permite optimizar por calidad comercial, no solo por cantidad de formularios.

---

## Dirección general propuesta

### Una firma boutique de crecimiento y tecnología, con la precisión visual de un product studio

La dirección que recomiendo combina:

- **Sobriedad editorial** en tipografía y color.
- **Prueba concreta** en proyectos y resultados.
- **Presencia humana** de los socios.
- **Demostraciones interactivas** de marketing, datos y automatización.
- **Movimiento breve y funcional**, con una o dos experiencias realmente memorables.

Una posible línea conceptual, todavía para trabajar, sería:

> **Crecimiento digital y automatización, con los socios dentro de tu negocio.**

La oportunidad más fuerte está en mostrar la conexión entre **criterio comercial, ejecución y sistemas propios**. El workspace ya contiene una operación y una metodología mucho más ricas que lo que hoy logra expresar la landing.

**Mi recomendación final: conservar la identidad de base y reconstruir el relato, los casos y el sistema de interacción alrededor de esa evidencia. Ahí está el “wow factor” más profesional y más difícil de copiar.**

La implementación queda pendiente de tu aprobación del análisis.
