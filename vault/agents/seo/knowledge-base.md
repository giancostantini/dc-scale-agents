# Knowledge Base — SEO Agent
<!-- Conceptos fundamentales que el agente debe internalizar antes de generar cualquier pieza SEO. Se enriquece con fuentes validadas. -->

## 1. Intencion de busqueda

La razon o proposito que tiene un usuario al hacer una consulta. No son solo las palabras que escribe, sino lo que realmente quiere lograr: informarse, navegar, comprar o comparar.

### Los 4 tipos

| Intencion | Ejemplo de busqueda | Contenido ideal | Objetivo de negocio |
|-----------|---------------------|-----------------|---------------------|
| **Informacional** | "Que es SEO", "como cuidar cuero" | Articulos, guias, videos, FAQs, snippets destacados | Generar confianza y captar leads |
| **Navegacional** | "Sitio oficial Nike", "dmancuello instagram" | Home, landing de marca, sitelinks | Facilitar acceso directo |
| **Transaccional** | "Comprar zapatillas Nike", "billetera cuero precio" | Pagina de producto con CTA claro, marketplaces | Venta directa |
| **Comercial (investigativa)** | "Nike vs Adidas", "mejor billetera cuero" | Reviews, comparativas, testimonios, rankings | Influir la decision de compra |

### Aplicaciones practicas

1. **Titulos y meta-descriptions** — reflejar la intencion. Informacional promete respuesta clara; transaccional incluye CTA explicito; comercial destaca comparacion/diferencial.
2. **Formato de pagina** — el diseno y estructura se adaptan a la intencion. Comercial incluye comparativas y testimonios; informacional prioriza contenido detallado y escaneable; transaccional minimiza fricciones hacia el checkout.
3. **Objetivos de conversion** — la intencion define que accion querras que tome el usuario: suscribirse, comparar, comprar.

### Reglas operativas para el agente

- Antes de generar cualquier pieza, identificar explicitamente la intencion dominante del keyword principal y anotarla en la metadata del output.
- Si un keyword tiene intencion mixta (ej: "mejor billetera de cuero" = comercial + transaccional), priorizar la dominante pero incluir senales de la secundaria.
- Identificar bien la intencion mejora CTR y tasas de conversion, no solo rankings.
- Nunca mezclar formato e intencion: una guia informacional no debe ser un landing de venta disfrazado.

---

## 2. SERP Features

La SERP (Search Engine Results Page) ya no es una lista de 10 links azules — es un ecosistema de elementos especiales (SERP features) que indican como Google interpreta la intencion y como los usuarios prefieren consumir la informacion.

### Por que importan (desde negocio)

Son oportunidades de destacarse sobre la competencia **sin depender del ranking organico tradicional**. Cada feature es una senal de que tipo de contenido valora Google para esa busqueda especifica.

### Features clave a evaluar

| Feature | Que es | Oportunidad estrategica | Como targetearla |
|---------|--------|-------------------------|------------------|
| **Featured Snippet** | Bloque destacado arriba con respuesta directa | Autoridad inmediata. Aunque favorece "zero-click", aumenta citabilidad y confianza de marca. | Incluir definicion de 40-60 palabras directo despues del H1, listas numeradas o tablas breves. |
| **People Also Ask (PAA)** | Preguntas frecuentes expandibles | Mapa de curiosidad del usuario — revela long-tails que la competencia ignora. | Usar las preguntas PAA como H2/H3 literales y responder en 2-3 parrafos. |
| **Mapas / Local Pack** | Resultados geolocalizados con pins | Dominio local. Critico para negocios con presencia fisica o envio regional (Uruguay, Latam). | Optimizar Google Business Profile antes que el blog; NAP consistente. |
| **Imagenes** | Carrusel de imagenes | Relevante para productos visuales (cuero artesanal, moda). | Alt-text optimizado con keyword, nombres de archivo descriptivos, alta calidad. |
| **Videos** | Carrusel de videos (YouTube) | Senal de que Google valora video para esa query. | Coordinar con Content Creator para video embebido + transcripcion. |
| **Reviews / Estrellas** | Rating visible en el resultado | Aumenta CTR de forma fuerte. | Schema markup Review/Product con aggregateRating. |

### Proceso estrategico (obligatorio antes de escribir)

1. **Mapear la SERP** — googlear el keyword principal y listar que SERP features aparecen.
2. **Interpretar** — si domina PAA → estructurar con preguntas. Si domina Featured Snippet → incluir definicion corta al inicio. Si dominan Mapas → priorizar GMB sobre blog. Si dominan Videos → coordinar con Content Creator.
3. **Seleccionar batallas** — no pelear todas. Priorizar features donde el cliente tiene chance real vs. donde ya hay autoridad consolidada (ej: Wikipedia en el Featured Snippet suele ser imbatible).
4. **Documentar** — cada brief/blog-post debe incluir una linea "SERP features detectadas y targeteadas: [lista]".

### Leer la SERP como mapa de oportunidades

El objetivo final no es solo posicionar — es dominar la interaccion visual y la confianza del usuario en el momento de decision. Evaluar estrategicamente la presencia de cada elemento para decidir el formato optimo que garantice que la marca sea la primera opcion.

### Long-tails y preguntas naturales (palanca tactica)

No todas las keywords valen igual. Las **long-tails** (frases largas y especificas, 4+ palabras) reflejan una intencion mucho mas clara y estan mas cerca de la conversion que las head keywords.

- **Por que priorizarlas:** menos competencia, mayor especificidad, intencion mas definida, CTR mas alto.
- **Preguntas naturales como arma:** incorporar preguntas literales ("como", "por que", "cuanto cuesta", "cual es mejor") invita a Google a mostrar la marca en PAA y Featured Snippets. Son la via mas directa a estos features.
- **Regla operativa:** cada pieza SEO debe targetear 1 keyword principal (head o mid-tail) + 3-5 long-tails + 2-3 preguntas naturales. Las preguntas van como H2/H3 literales.

---

## 3. Metricas de keyword research

Entender las metricas es obligatorio para priorizar keywords correctamente y no desperdiciar esfuerzo en terminos sin potencial o imposibles de rankear.

### Las 4 metricas clave

| Metrica | Que mide | Como interpretarla |
|---------|----------|--------------------|
| **Volumen de busqueda** | Cantidad promedio de busquedas mensuales | Nivel de interes general del publico. Alto volumen = alta demanda pero mas competencia. |
| **Competencia** | Cuantos anunciantes pujan por esa keyword en Google Ads (baja/media/alta) | Aunque es metrica de Ads, indica dificultad aproximada para posicionar organicamente. Alta competencia suele indicar alto valor comercial. |
| **CPC (Costo por clic)** | Costo promedio que paga un anunciante por clic | **Proxy del valor comercial** del termino. CPC alto = mayor intencion comercial / transaccional. CPC bajo + volumen alto = suele ser informacional. |
| **Tendencias** | Como varia el interes en el tiempo | Detectar estacionalidad (ej: "regalo dia del padre"), crecimiento sostenido vs modas pasajeras, picos por eventos. |

### Orientativas vs accionables (framework estrategico)

No todas las metricas tienen el mismo peso para tomar decisiones:

- **Metricas orientativas** (volumen, competencia, CPC): dan vision general del mercado. Utiles para **explorar oportunidades**, pero NO garantizan resultados por si solas. Son estimaciones de terceros.
- **Metricas accionables** (tendencias reales, datos de Search Console: impresiones, clics, CTR, posicion): muestran que esta funcionando **en este sitio especifico**. Permiten **tomar decisiones concretas** sobre contenido, optimizacion y prioridades.

**Regla del agente:** usar metricas orientativas para generar hipotesis de keywords. Validar y priorizar con metricas accionables cuando lleguen datos reales de Search Console. Nunca confundir potencial estimado con rendimiento real.

### Herramientas de keyword research

| Herramienta | Uso | Notas |
|-------------|-----|-------|
| **Google Keyword Planner** | Estimar volumen y competencia, generar ideas relacionadas (variaciones, sinonimos, long-tails), analizar CPC y tendencias. Gratis con cuenta de Google Ads. | Aunque es de Ads, es fuente confiable para SEO porque refleja comportamiento real de usuarios. Cubre el mercado local (Uruguay, Latam). |
| **Google Search Console** | Metricas accionables reales del sitio (impresiones, clics, CTR, posicion promedio). | Fuente de verdad para evaluar rendimiento. Alimenta keyword-database y winning-pages. |
| **Google Trends** | Validar estacionalidad y detectar momentum de un termino. | Util para decidir cuando publicar (ej: contenido de regalos pre-fechas). |
| **Revision manual de SERP** | Ver que features dominan, quien rankea, que angulo cubren los competidores. | Obligatorio antes de escribir cualquier pieza.  |

### Framework de priorizacion (scoring)

Para gestionar una lista de keywords, no alcanza con listar — hay que **puntuar cada oportunidad** y priorizar por balance entre impacto y esfuerzo.

**Dimensiones del scoring:**

| Dimension | Que evalua | Fuente |
|-----------|------------|--------|
| Demanda | Volumen promedio de busquedas mensuales | Google Keyword Planner |
| Competencia | Dificultad estimada para rankear (baja/media/alta) | Google Keyword Planner |
| Intencion | Proposito del usuario (informativa, comercial, transaccional, navegacional) | Analisis cualitativo de la SERP |
| Potencial de trafico | Trafico estimado considerando posicion alcanzable + CTR esperado | Search Console + estimacion |

**Formula base:**

```
Scoring = (Demanda × Intencion) / Competencia
```

- **Demanda:** normalizar a escala comparable (ej: volumen directo o logaritmico si hay mucha dispersion).
- **Intencion:** valor numerico segun relevancia para el negocio. Default: `1 = informacional`, `2 = comercial/navegacional`, `3 = transaccional`. Ajustable segun objetivo (ver abajo).
- **Competencia:** divisor — penaliza keywords con alta dificultad.

**Ejemplo practico:**

| Keyword | Demanda | Intencion | Competencia | Scoring |
|---------|---------|-----------|-------------|---------|
| "Comprar zapatillas" | 10,000 | 3 | 8 | 3,750 |
| "Zapatillas comodas" | 5,000 | 2 | 4 | 2,500 |
| "Historia de las zapatillas" | 2,000 | 1 | 2 | 1,000 |

"Comprar zapatillas" gana por combinar demanda alta + intencion transaccional + competencia manejable.

### Ajuste del scoring segun objetivo de negocio

El framework es **guia, no regla absoluta**. Ajustar pesos segun el objetivo activo:

- **Captar ventas inmediatas** → aumentar peso de intencion transaccional (ej: transaccional = 4, comercial = 2, informativa = 0.5).
- **Branding y educacion** → aumentar peso de intencion informativa (ej: informativa = 3, comercial = 2, transaccional = 1).
- **SEO local** → sumar factor por potencial geolocalizado (multiplicar scoring × 1.3 si tiene intencion local relevante para el mercado del cliente).
- **Estacionalidad** → penalizar keywords en decrecimiento o bonificar en fase de crecimiento segun Google Trends.

**Regla operativa del agente:** en cada sesion de keyword research, generar scoring de todas las keywords candidatas y exportar ranked. El Consultant Agent decide el objetivo de negocio activo; el SEO Agent lo traduce en pesos de scoring.

---

## 4. Clustering y arquitectura de contenido

SEO moderno no es una coleccion de articulos sueltos — es **arquitectura**. Las keywords se agrupan en clusters tematicos que se mapean a una estructura de sitio con jerarquia clara.

### Clustering de keywords

Proceso de organizar keywords en grupos (clusters) que comparten intencion, tema y contexto. Facilita crear contenido enfocado y evita canibalizacion (dos paginas peleando por la misma keyword).

**Metodos:**

| Metodo | Cuando usarlo | Base |
|--------|---------------|------|
| **Manual** | Proyectos pequenos o medianos, o cuando hay que definir la estructura inicial de clusters. Da mayor control. | Agrupacion por intencion de busqueda, topicos relacionados, volumen/competencia. |
| **Semiautomatico** | Proyectos grandes con cientos/miles de keywords. Acelera el trabajo. | Analisis de co-ocurrencia en SERPs (si dos keywords comparten top 10, suelen ser cluster), algoritmos (k-means, DBSCAN), herramientas SEO con agrupaciones automaticas. Siempre requiere revision humana para validar y ajustar. |

**Criterios para agrupar:**
1. **Relevancia tematica:** keywords sobre el mismo tema o subtema.
2. **Intencion de busqueda:** misma intencion dominante (no mezclar informativa con transaccional en el mismo cluster).
3. **Volumen y competencia:** priorizar clusters con potencial estrategico (alto volumen agregado + competencia manejable).

### Mapping a la arquitectura del sitio

Cada cluster se mapea a un **tipo de pagina** con rol SEO definido:

| Tipo de pagina | Descripcion | Rol SEO |
|----------------|-------------|---------|
| **Pagina Pilar** | Pagina principal que cubre un tema central de forma amplia. Suele targetear la head keyword del cluster. | Autoridad y relevancia general sobre el tema. Internal-linking hub. |
| **Paginas de apoyo** | Subpaginas que profundizan subtemas especificos. Targetean mid-tail y long-tails. | Soporte y detalle — alimentan autoridad del pilar via internal links. |
| **FAQ** | Preguntas frecuentes relacionadas al cluster. Targetean preguntas literales. | Respuestas rapidas + captura de Featured Snippets y PAA. |

**Ejemplo de mapping (cluster "calzado deportivo femenino"):**

- Pagina Pilar → "Zapatillas deportivas mujer" (head keyword, guia completa)
- Pagina de apoyo → "Zapatillas para correr mujer" (mid-tail, especifico)
- Pagina de apoyo → "Zapatillas fitness mujer" (mid-tail, especifico)
- FAQ → "Como elegir zapatillas de running" (long-tail pregunta)
- FAQ → "Que diferencia hay entre running y training" (long-tail pregunta)

### Reglas operativas para el agente

1. **Antes de generar una pieza suelta, preguntar:** ¿existe el cluster al que pertenece? ¿la pieza pilar ya fue creada? Si no hay pilar, priorizar construirla primero.
2. **Cada cluster debe tener 1 pilar + N paginas de apoyo + M FAQs.** Nunca una pagina pilar sola — queda huerfana.
3. **Internal linking obligatorio:** cada pagina de apoyo linkea al pilar. Cada FAQ linkea al pilar o a la pagina de apoyo relevante. El pilar linkea a todas sus hijas.
4. **Evitar canibalizacion:** una misma keyword principal jamas debe ser target de dos paginas distintas. Si aparece ese caso, fusionar o redirigir.
5. **Documentar el cluster map** en `seo-library.md` del cliente: que clusters existen, que piezas estan publicadas, cuales faltan.

---

## 5. Formato de contenido y marcado estructurado

### Enfoque "respuesta-primero" (answer-first)

Consiste en redactar **fragmentos/parrafos iniciales que respondan la consulta de forma directa y concisa** antes de profundizar. Mejora significativamente la probabilidad de aparecer en Featured Snippets y otros formatos destacados del SERP.

**Por que funciona:**
- Las busquedas exigen respuestas rapidas — el usuario no quiere leer 500 palabras de intro.
- Google prioriza contenido que satisface la necesidad inmediata.
- Un Featured Snippet se genera, justamente, extrayendo el parrafo que resuelve la pregunta.

**Regla operativa del agente:**
- Despues de cada H2 que sea una pregunta, incluir **un parrafo de 40-60 palabras que responda directo** en las primeras oraciones. Luego ampliar con contexto, ejemplos, detalles.
- Si el H1 es una pregunta, repetir el mismo patron: definicion/respuesta corta primero, despues todo lo demas.

**Ejemplo:** Si el bloque es "¿Como hacer keyword research?", el primer parrafo debe ofrecer una respuesta directa y clara explicando en pocas lineas que es el proceso y para que sirve.

### Marcado estructurado (Schema markup / JSON-LD)

El **marcado estructurado** es codigo (tipicamente en formato JSON-LD) que se agrega al HTML para ayudar a los motores de busqueda a entender el significado y contexto de una pagina.

**Beneficios:**
- Mayor visibilidad en SERP (resultados enriquecidos).
- Mejor CTR (estrellas, precios, fechas visibles desde la busqueda).
- Posibilidad de aparecer en SERP features especificos (FAQ, HowTo, Product, Review, Event, LocalBusiness, etc.).

**Schemas prioritarios por tipo de pagina:**

| Tipo de pagina | Schema recomendado | Que habilita |
|----------------|-------------------|--------------|
| Producto (ecommerce) | `Product` + `AggregateRating` + `Offer` | Estrellas, precio, disponibilidad en SERP |
| Blog post con preguntas | `FAQPage` | Bloque FAQ expandible en resultado |
| Tutorial paso-a-paso | `HowTo` | Pasos numerados en SERP |
| Review / comparativa | `Review` | Rating visible |
| Pagina de negocio fisico | `LocalBusiness` + NAP | Aparece en Local Pack y Maps |
| Breadcrumbs del sitio | `BreadcrumbList` | Breadcrumbs en URL del resultado |

**Regla operativa:** cada pieza generada por el agente debe incluir en la metadata del output una recomendacion explicita de schema markup (no solo "sugerido" — tipo concreto + campos clave).

### SEO Local y GEO

El SEO local optimiza la presencia para **busquedas con intencion geografica** (explicita — "cuero Montevideo" — o implicita — Google detecta ubicacion del usuario). Critico para negocios con presencia fisica, envio regional o marca con anclaje local.

**Pilares del SEO local:**

1. **Google Business Profile (ex GMB):** perfil completo, categorias correctas, fotos, horarios, productos/servicios, resenas gestionadas.
2. **NAP consistency** — el trio **Name, Address, Phone** debe ser **identico** en todos lados: sitio web, GMB, directorios, redes sociales. Inconsistencias confunden a Google y penalizan ranking local.
3. **Datos estructurados `LocalBusiness`** en el sitio web, con NAP completo.
4. **Resenas locales:** cantidad, frescura y calidad son factor de ranking en el Local Pack. Gestionar respuestas.
5. **Contenido con senales locales:** mencionar ciudades, barrios, landmarks relevantes naturalmente.

**Para DMancuello (Uruguay + expansion Latam):** priorizar optimizacion por ciudades clave (Montevideo, Punta del Este en UY; Bogota, Medellin, Lima, Asuncion, Ciudad del Este en expansion) con paginas o secciones geolocalizadas cuando tenga sentido.

---

## 6. SEO Off-Page: autoridad, backlinks y menciones

### On-Page vs Off-Page

| Aspecto | SEO On-Page | SEO Off-Page |
|---------|-------------|--------------|
| **Enfoque** | Optimizacion interna del sitio | Factores externos al sitio |
| **Ejemplos** | Contenido, metaetiquetas, URLs, velocidad, estructura | Backlinks, menciones, reputacion, social |
| **Control directo** | Alto | Limitado — depende de terceros |
| **Objetivo** | Mejorar estructura y relevancia | Construir autoridad y confianza |

### Componentes clave del Off-Page

1. **Backlinks** — enlaces de otros sitios apuntando al tuyo. La senal de autoridad mas fuerte. No todos pesan igual (ver calidad abajo).
2. **Menciones** — referencias al negocio, producto o autor **con o sin enlace**. Refuerzan reconocimiento de marca, confianza y autoridad.
3. **Senales sociales** — interacciones en redes (compartidos, comentarios, alcance). No son factor de ranking directo, pero facilitan obtencion de enlaces y percepcion de relevancia/popularidad.
4. **Reputacion online** — resenas, men­ciones, presencia en directorios y coberturas. Construye confianza en el usuario y en el algoritmo.

### Tipos de backlinks + priorizacion

| Tipo | Descripcion | Prioridad |
|------|-------------|-----------|
| **Editoriales** | Naturales, aparecen en contenido de un sitio por calidad/relevancia (ej: blog de cuero menciona DMancuello en articulo sobre artesania uruguaya) | **Alta** — son el gold standard |
| **UGC (User Generated Content)** | Generados por usuarios: comentarios, foros. Pueden ser valiosos o spam. | Media-Alta si son reales |
| **Guest posts** | Articulos publicados como invitado en otro sitio. Relevancia tematica > autoridad del dominio. | Media |
| **Directorios** | Listados y catalogos (Paginas Amarillas, directorios de nicho). Si son de calidad y relevantes, aportan. | Baja-Media |
| **Nofollow** | Con atributo `rel="nofollow"` — indica a motores no seguirlos. No transmiten autoridad directa, pero generan trafico y senales sociales. | Baja (pero no nulo) |

### Criterios de calidad de un backlink

Mas importante que la cantidad:

| Criterio | Que evaluar |
|----------|-------------|
| **Autoridad del dominio** | Domain Authority (Moz) o Authority Score (SEMrush). Enlaces desde dominios fuertes pesan mas. |
| **Relevancia tematica** | Debe estar conectado al nicho/industria. Un enlace de un blog de moda vale mas para DMancuello que uno de un blog de autos. |
| **Texto ancla (anchor text)** | Descriptivo y relevante. **Evitar sobreoptimizacion** (si todos los anchors son "comprar billetera cuero" Google lo detecta como antinatural). |
| **Posicion en la pagina** | Enlaces dentro del contenido principal pesan mas que en footer/sidebar. |
| **Senales de confianza del sitio fuente** | Ausencia de spam, buena UX, trafico organico real. |

### Checklist para evaluar un backlink entrante

- ¿El dominio que enlaza tiene autoridad?
- ¿El contenido del sitio es relevante para el nicho?
- ¿El texto ancla es descriptivo y natural?
- ¿El enlace esta dentro del contenido principal?
- ¿El sitio tiene senales de confianza (sin spam, buen trafico)?

Si responde positivo en la mayoria → enlace de calidad.

### Menciones sin enlace y citabilidad

Google **reconoce menciones sin hipervinculo** como senal de autoridad y reputacion, especialmente cuando provienen de fuentes relevantes y confiables. Este concepto se llama **citabilidad**: capacidad de la marca para ser mencionada y reconocida online.

**Implicancias:**
- Aunque no transmiten autoridad directa como backlinks, refuerzan visibilidad de marca, confianza y senales para SEO local.
- Son especialmente valiosas en negocios locales (menciones en directorios, resenas, notas) y en industrias donde el boca-a-boca digital pesa.
- El SEO Agent debe tener una estrategia de **generacion de citabilidad** (relaciones publicas digital, presencia en directorios relevantes) no solo de link building puro.

### Gestion de riesgos: enlaces toxicos y disavow

Algunos backlinks son perjudiciales (sitios spam, granjas de enlaces, dominios penalizados). Pueden arrastrar el ranking hacia abajo.

- **Identificacion:** auditar con GSC y herramientas como SEMrush. Enlaces provenientes de sitios spam, con baja autoridad, o tematicamente irrelevantes.
- **Mitigacion:** usar la **herramienta de disavow de Google** para indicar que ciertos enlaces no deben ser considerados. Solo cuando hay un patron claro de enlaces toxicos — usar con cuidado, no por paranoia.

### Herramientas de auditoria off-page

| Herramienta | Para que |
|-------------|----------|
| **Google Search Console** | Reporte gratis de backlinks: dominios de referencia, paginas enlazadas, textos ancla. Via: Enlaces → Enlaces externos. |
| **SEMrush** (paga) | Backlink Analytics: Domain Authority, dofollow/nofollow, relevancia tematica, ubicacion del enlace. Ideal para analizar competencia y encontrar oportunidades. |
| **Ahrefs / Moz** (paga, alternativas) | Similar a SEMrush. |

### Regla operativa del agente

En cada ciclo (mensual o cuando se ejecute auditoria off-page):
1. Extraer perfil de backlinks actuales del cliente via GSC.
2. Evaluar calidad segun criterios de arriba.
3. Flagear toxicos candidatos a disavow.
4. Proponer al Consultant Agent acciones de link building segun el cluster que se quiera reforzar.
5. Registrar menciones sin enlace de marca en la vault (alimenta citabilidad y puede generar oportunidades de pedir el enlace).

### Link Building y Digital PR (disciplinas complementarias)

**Link Building** = proceso de obtener enlaces externos que apunten al sitio para mejorar autoridad y posicionamiento.
**Digital PR** = construir relaciones y menciones en medios digitales para aumentar visibilidad y reputacion de marca.

Son complementarios: el Link Building se enfoca en el enlace; el Digital PR en la relacion y la mencion (que muchas veces deriva en enlace).

### Tacticas legitimas de link building

| Tactica | Descripcion | Cuando priorizarla |
|---------|-------------|-------------------|
| **Guest posts** | Publicar contenido original y de calidad en blogs, medios o sitios relevantes. | Cuando hay autoridad temática en el cliente y capacidad de producir contenido largo y util. |
| **Colaboraciones** | Asociarse con influencers, expertos, instituciones o marcas afines para contenido conjunto, eventos, investigaciones, campanas. | Genera enlaces **y** menciones naturales de multiples fuentes. Alto impacto para branding. |
| **Recuperar menciones sin enlace** | Detectar referencias a la marca que no incluyen enlace y hacer outreach para solicitar el enlace. | Una de las tacticas mas eficientes: ya existe la mencion, solo falta convertirla en link. |
| **Contenido linkeable** | Crear recursos unicos y originales (guias definitivas, estudios propios, infografias, datasets) que otros quieran enlazar naturalmente. | Estrategia mas sostenible a largo plazo. Potencia autoridad tematica y atrae enlaces sin outreach. |

### Priorizacion de oportunidades

Al evaluar sitios para pedir enlace/mencion, puntuar con:

| Criterio | Pregunta clave |
|----------|----------------|
| **Relevancia del sitio** | ¿El sitio donde obtendria el enlace es relevante para el nicho del cliente? |
| **Autoridad del dominio** | ¿Tiene metricas SEO (DR/DA) solidas? |
| **Tipo de enlace** | ¿Sera editorial, colaboracion o patrocinado? (editorial > colab > patrocinado) |
| **Alcance y audiencia** | ¿La audiencia del sitio coincide con el publico objetivo del cliente? |

### Outreach: contactar para conseguir enlaces/menciones

**Outreach** = proceso de contactar personas o sitios web relevantes para conseguir enlaces, menciones o colaboraciones. **No es enviar correos masivos** — es construir relaciones autenticas.

**Principios del mensaje:**

1. **Personalizacion:** investigar al destinatario, adaptar el mensaje a su estilo, tema reciente o publicacion especifica.
2. **Claridad y brevedad:** ser directo sobre el valor que ofreces y lo que solicitas. Nadie lee correos de 5 parrafos.
3. **Relevancia:** explicar por que tu contenido o propuesta es util **para la audiencia del destinatario**, no para vos.

**Plantillas por target (adaptar siempre, nunca mandar literal):**

| Target | Apertura ejemplo |
|--------|------------------|
| **Periodistas** | "Hola [Nombre], vi tu articulo sobre [tema] y creo que este recurso puede aportar valor a tus lectores..." |
| **Bloggers** | "Hola [Nombre], me encanto tu post sobre [tema]. Queria compartir contigo este contenido que complementa tu enfoque..." |
| **Webmasters** | "Hola [Nombre], gestiono un sitio sobre [tema relacionado]. Me gustaria explorar una colaboracion que beneficie a ambos..." |

**Reglas de outreach:**
- Usar el nombre del destinatario y referencia especifica a su trabajo.
- Evitar plantillas genericas o spam — Gmail las detecta y matan la reputacion del dominio del cliente.
- Segmentar listas por tipo de contacto (no mezclar periodistas con webmasters en la misma campana).
- **Calidad y contexto > cantidad.** 10 outreachs personalizados convierten mas que 500 genericos.

### Calendarizacion de campanas off-page

Las campanas de link building no son eventos puntuales — son **procesos continuos**. Cada campana debe tener:

- Fechas de contacto inicial y seguimientos (1er follow-up a 5 dias, 2do a 10).
- Creacion e integracion del contenido que se va a pitchear.
- Evaluacion de resultados al cierre (cuantos enlaces, calidad, trafico generado).
- Registro en vault: `vault/clients/[client]/off-page-log.md` (candidato a crear).

### KPIs off-page (para medir exito)

| KPI | Que mide | Fuente |
|-----|----------|--------|
| **Enlaces de referencia (backlinks)** | Numero + calidad de sitios que enlazan al dominio. Cantidad sin calidad no sirve. | GSC, SEMrush |
| **Domain Rating / Authority Score** | Indicadores que miden autoridad del dominio enlazante. Impactan la fuerza del backlink. | Moz, SEMrush, Ahrefs |
| **Trafico referido** | Visitas que llegan via enlaces externos. Mide impacto real en audiencia. | Google Analytics |
| **Posiciones en buscadores** | Cambios en ranking de keywords relacionadas con las acciones off-page. | GSC |
| **Senales locales** (para SEO local) | Menciones en directorios, resenas, presencia en GBP, ranking en Local Pack. | GBP dashboard, herramientas locales |

**Regla del agente:** en cada reporte de performance (semanal/mensual), incluir estos KPIs off-page junto a los on-page. El Consultant Agent los consolida en el brief ejecutivo.

---

## 7. Medicion de rendimiento SEO y segmentacion avanzada

### Metricas fundamentales de visibilidad organica

Para medir presencia y rendimiento de un sitio en buscadores:

| Metrica | Definicion | Interpretacion |
|---------|------------|----------------|
| **Impresiones** | Numero de veces que una URL aparece en resultados de busqueda para una consulta. | Indica visibilidad potencial. Crece con ranking y cantidad de keywords cubiertas. |
| **Clics** | Veces que usuarios hacen clic en el enlace hacia el sitio. | Trafico organico real. |
| **CTR (Click-Through Rate)** | Porcentaje de clics sobre impresiones: `CTR = (Clics / Impresiones) × 100`. | Mide efectividad del snippet para atraer. CTR bajo con posicion alta = titulo/meta flojo. |
| **Posicion media** | Promedio de posicion en resultados para las consultas analizadas. | Posicion menor = mejor ranking. Pero el promedio **oculta distribucion**. |
| **Cobertura** | Estado de indexacion y errores que afectan visibilidad. | Critico — si hay paginas no indexadas, no rankean por mas que esten optimizadas. |

**Ejemplo:** 1000 impresiones + 50 clics → CTR = 5%. Posicion media 3 → aparece en promedio en tercer lugar.

### Limitaciones que el agente debe conocer

Interpretar metricas sin entender sus limitaciones lleva a decisiones equivocadas:

- **Muestreo y retrasos:** GSC muestra datos muestreados y con retraso de 2-3 dias. No es tiempo real.
- **Filtros y segmentacion:** aplicar filtros incorrectos puede excluir datos relevantes o incluir ruido.
- **Discrepancias entre fuentes:** GSC y Google Analytics pueden diferir (metodologias distintas — GSC cuenta impresiones, GA cuenta sesiones).
- **Posicion media engana:** una posicion media 5 puede ocultar alta variabilidad (ej: posicion 1 para algunas consultas y posicion 15 para otras).

**Regla operativa:** cuando el agente analice metricas, siempre cruzar varias fuentes (GSC + GA + herramienta de terceros) y considerar contexto temporal antes de concluir.

### Segmentacion en Google Search Console

Dividir los datos en grupos manejables para analizar comportamientos especificos. Permite responder preguntas como:
- ¿Que consultas generan mas trafico desde un pais?
- ¿Como se comportan las paginas de un directorio?
- ¿Que dispositivos predominan en ciertas consultas?

**Criterios basicos:**
- **Consulta** — palabras/frases que usuarios buscan.
- **Pagina** — URLs o grupos de paginas.
- **Pais** — ubicacion geografica.
- **Dispositivo** — movil, escritorio, tablet.

### Expresiones Regulares (Regex) en GSC

Regex permite buscar y agrupar consultas/paginas por patrones, no solo por coincidencias exactas.

**Sintaxis basica:**

| Simbolo | Significado |
|---------|-------------|
| `.` | Cualquier caracter |
| `*` | Cero o mas repeticiones del anterior |
| `+` | Una o mas repeticiones |
| `[abc]` | Cualquier caracter del conjunto |
| `^` | Inicio de cadena |
| `$` | Fin de cadena |
| `|` | OR (alternativa) |

**Ejemplos practicos:**

| Objetivo | Regex | Descripcion |
|----------|-------|-------------|
| Agrupar consultas con intencion de compra | `(comprar\|precio\|cotizar)` | Captura variaciones con cualquiera de esos terminos |
| Filtrar URLs de marca | `^/marca-xyz/` | URLs que empiezan con `/marca-xyz/` |
| Agrupar paginas de blog | `/blog/.*` | Todas las URLs que contienen `/blog/` y cualquier cosa despues |

### Cohortes

Una **cohorte** es un grupo de usuarios o datos que comparten una caracteristica comun durante un periodo. Util para:
- Comparar usuarios que llegan por trafico organico tradicional vs trafico generativo (GEO).
- Comparar consultas de marca vs consultas genericas.
- Medir impacto de una tactica especifica.

**Regla operativa:** crear cohortes requiere criterios claros y consistentes. Si los criterios son ambiguos o cambian en el tiempo, las comparaciones no son utiles.

### Google Analytics 4: modelo basado en eventos

GA4 abandona el modelo de sesiones/paginas vistas y adopta un modelo **basado en eventos**. Cada interaccion del usuario se registra como un evento con parametros.

| Concepto | Definicion | Ejemplos |
|----------|------------|----------|
| **Evento** | Accion o suceso registrado | `page_view`, `purchase`, `click`, `scroll` |
| **Parametro** | Detalles adicionales del evento | `page_location`, `item_category`, `value` |
| **Dimension** | Atributo para segmentar datos | Fuente de trafico, dispositivo, pais |

**Ventaja para el agente:** permite medir con precision origen y comportamiento, detectar interacciones relacionadas con GEO via eventos personalizados, y analizar adquisicion de trafico con granularidad mucho mayor.

**Regla operativa:** al auditar un cliente, verificar que GA4 este configurado con eventos personalizados para trafico GEO (ver seccion 8). Sin esto, el trafico generativo es invisible.

### Modelos de atribucion

La **atribucion** es el proceso de asignar valor a las diferentes interacciones que un usuario tiene antes de convertir. Cual modelo usar cambia totalmente como se interpreta el aporte del SEO.

| Modelo | Como funciona | Cuando usarlo |
|--------|---------------|---------------|
| **Ultimo clic** | Todo el credito va a la ultima fuente antes de la conversion | Default de Google Analytics. Subestima SEO informacional (que suele ser primer contacto). |
| **Primer clic** | Todo el credito va a la primera interaccion | Sobrevalora el descubrimiento. Util para evaluar contenido top-of-funnel. |
| **Lineal** | Credito distribuido equitativamente entre todas las interacciones | Mas justo para ciclos de compra largos. Refleja mejor el valor del contenido SEO en el journey. |
| **Basado en posicion / Time decay** | Modelos mas avanzados que dan mas peso a inicio + final o decaimiento en el tiempo | Ideal para ecommerce con journeys complejos (relevante para DMancuello). |

**Regla del agente:** al reportar performance, aclarar siempre **que modelo de atribucion se esta usando**. El mismo trafico SEO puede parecer irrelevante con ultimo clic y ser critico con lineal. Para clientes con ciclos de compra > 1 dia, proponer al Consultant Agent migrar de "ultimo clic" a "lineal" o "basado en posicion".

### Conectar metricas SEO con KPIs de negocio

El SEO en silo no es util — el agente debe conectar sus metricas con los KPIs comerciales del cliente.

**KPIs comerciales tipicos a mapear:**

- **Conversiones:** acciones valiosas (compras, registros, descargas, leads).
- **LTV (Customer Lifetime Value):** ingreso proyectado por cliente a lo largo del tiempo.
- **Tasa de conversion por segmento:** % por canal (organico vs directo vs paid) o dispositivo.

**Mapeo metricas SEO → impacto en negocio:**

| Metrica SEO | KPI comercial relacionado | Impacto en ROI |
|-------------|--------------------------|----------------|
| Trafico organico | Leads generados | Incremento en oportunidades de venta |
| Posicion en SERP | Visibilidad del sitio | Potencial aumento de conversiones |
| Tasa de rebote | Calidad del trafico | Mejoras en engagement y retencion |
| Conversiones desde organico | Revenue atribuido a SEO | ROI directo del canal |

**Regla del agente:** cada reporte de SEO debe presentar metricas organicas **junto a** sus KPIs comerciales relacionados. No reportar solo "subio trafico 20%" — reportar "subio trafico 20% → se generaron X leads adicionales → equivalente a $Y en oportunidades".

### Dashboards con Looker Studio

**Looker Studio** (ex Data Studio) es la herramienta estandar para crear dashboards que integran metricas SEO con KPIs de negocio. Gratis, conecta multiples fuentes.

**Conectores relevantes:**
- **Google Analytics 4** — datos de comportamiento y conversiones.
- **Google Search Console** — visibilidad organica y rendimiento en busquedas.
- **Archivos CSV** — importar datos externos o personalizados (ej: export de Supabase, Blotato).
- **Sheets** — para datos manuales o combinaciones.

**Buenas practicas (cuando el agente arma o audita un dashboard):**
1. Verificar consistencia entre fuentes (GSC impresiones vs GA4 sesiones).
2. Documentar filtros aplicados en cada widget.
3. Revisar periodos de comparacion (¿mismo mes? ¿ajustado por estacionalidad?).
4. Incluir plantillas preconfiguradas para clientes similares — facilita escalabilidad.

### Ciclo Observacion → Analisis → Accion

Un dashboard no es el objetivo — es el punto de partida. El valor esta en el ciclo:

1. **Observacion estrategica:** unificar metricas SEO + GEO, monitorear Share of Voice generativo, CTR organico.
2. **Analisis:** identificar patrones y oportunidades, priorizar acciones segun impacto y recursos.
3. **Accion:** plan de optimizacion medible — optimizar contenido, impulsar visibilidad, medir, ajustar, repetir.

**Regla operativa:** cada reporte debe cerrar con **3-5 acciones concretas priorizadas**, no solo datos. "Aca esta lo que paso" es inutil sin "aca esta lo que hay que hacer."

---

## 9. IA como herramienta de SEO

La IA (ChatGPT, Claude, Gemini, Perplexity) no es solo un canal a optimizar (GEO) — tambien es una **herramienta operativa** que acelera keyword research, ideacion de contenido, estructuracion y analisis de SERP.

### Keyword research con IA

Combinar IA con busquedas tradicionales **acelera el descubrimiento** de keywords y revela terminos que las herramientas tradicionales no capturan (long-tails conversacionales, preguntas naturales).

**Como usarla:**
- Pedir a la IA listas de keywords y temas basados en **contexto especifico del negocio** (nicho, productos, audiencia, region).
- Pedir variaciones, sinonimos, long-tails conversacionales.
- Pedir preguntas frecuentes que usuarios podrian tener sobre el producto/tema (alimentacion directa para PAA y FAQ).

**No reemplaza la validacion con datos reales.** La IA sugiere hipotesis; GKP/GSC/GT confirman con volumen y comportamiento real.

### Construccion de prompts efectivos

Un prompt mal construido desperdicia output. Reglas:

1. **Claridad y especificidad** — decir que pide, para quien, en que formato.
2. **Formato del output** — listas, tablas, JSON, parrafos. Default a tablas para keywords.
3. **Ejemplos (few-shot)** — dar 1-2 ejemplos del estilo/enfoque esperado.
4. **Contexto completo** — incluir nicho, pais/mercado, producto, competencia conocida, audiencia.

**Ejemplo de prompt reutilizable:**
```
Dame [10] palabras clave relacionadas con [tema] para [audiencia/nicho] en [pais/mercado],
enfocadas en [objetivo: informacional/transaccional/comercial].
Formato: tabla con columnas [Keyword | Volumen estimado | Intencion | Long-tail/Head].
```

### Repositorio de trabajo: Google Sheets

Para sistematizar el trabajo con IA y hacerlo reproducible, usar Sheets como **hoja de trabajo** por cliente/cluster. Estructura sugerida:

| Keyword | Prompt utilizado | Resultado de IA | Validacion GKP | Validacion SERP | Decision |
|---------|------------------|-----------------|----------------|-----------------|----------|

Beneficios:
- Permite versionar prompts y ver cuales generan mejores keywords.
- Facilita colaboracion con el equipo (Fede, consultant, cliente).
- Registra el **por que** de cada decision (descartada, priorizada, re-analizar).

### Plantillas reutilizables de prompts

Crear una libreria de prompts por tipo de tarea. Candidatos:

- **Ideacion de contenido:** "Genera [N] ideas de contenido sobre [tema] para [audiencia], enfocadas en [objetivo]."
- **Expansion de long-tails:** "Dame [N] variaciones long-tail de la keyword [keyword] con intencion [tipo]."
- **Analisis de competidor:** "Dado este contenido de competidor [URL/texto], identifica gaps, angulos no cubiertos, y oportunidades de diferenciacion."
- **Generacion de FAQs:** "Genera las [N] preguntas mas frecuentes que se hace alguien buscando [keyword], con respuestas de 40-60 palabras answer-first."

**Regla del agente:** mantener estas plantillas en `vault/agents/seo/prompt-library.md` y versionarlas. Cuando un prompt produce output de calidad consistente, marcarlo como `VALIDADO`. Cuando falla, anotar el por que para no repetirlo.

### Prompt de borrador de articulo (estructura completa)

Cuando el agente genera un borrador de articulo con IA, el prompt debe ser especifico en 4 dimensiones:

1. **Tono:** formal, cercano, profesional, didactico, conversacional. Debe alinearse con la voz del cliente (leer claude-client.md primero).
2. **Extension:** numero de palabras objetivo.
3. **Puntos a cubrir:** lista de temas/preguntas que debe responder el articulo.
4. **Formato:** estructura exacta del output (titulo, subtitulos, parrafos, FAQ, CTA).

**Ejemplo de prompt de borrador:**
```
Escribe un articulo de [N] palabras en tono [tono] para [audiencia].
Estructura: titulo atractivo que incluya la keyword "[keyword]", tres subtitulos H2
con contenido sustancial, una seccion de preguntas frecuentes al final con [N]
preguntas/respuestas, y un parrafo de cierre con CTA.
Incluye las keywords secundarias: [lista]. Escribe en espanol para [pais].
El articulo debe cumplir estas reglas SEO: respuesta directa en el primer parrafo,
parrafos de max 3 lineas, estructura compatible con featured snippet.
```

**Incluir siempre en el prompt de borrador:**
- Instruccion explicita de SEO: "usa palabras clave en los encabezados de forma natural, incluye preguntas frecuentes que puedan aparecer en PAA, y escribe el primer parrafo respondiendo directamente a la consulta".
- Instruccion de marca: "el tono debe reflejar [descriptor del cliente]".

### Flujo IA → Google Docs → Revision humana

El pipeline de produccion de contenido tiene 3 etapas:

```
Prompt estructurado → Borrador IA → Google Docs → Revision humana → Publicacion
```

1. **Borrador IA:** el SEO Agent genera el borrador segun el prompt de arriba.
2. **Google Docs:** el borrador se exporta/pega en Google Docs (permite edicion colaborativa, historial de versiones, comentarios del equipo y del cliente).
3. **Revision humana (obligatoria antes de publicar):** la IA acelera, pero no reemplaza el juicio editorial.

**Checklist de revision humana:**

- [ ] **Precision:** verificar que datos, cifras y afirmaciones sean correctos y actualizados.
- [ ] **Alineacion con marca:** tono y estilo reflejan la voz del cliente (no generica de IA).
- [ ] **SEO basico:** keywords bien integradas en H1/H2/H3, meta title/description optimizados, FAQ incluida.
- [ ] **Lectura critica:** detectar errores, incoherencias o informacion confusa.
- [ ] **Links internos:** verificar que los links sugeridos existen y son correctos.

**Regla operativa:** ningun borrador IA se publica sin revision humana que haya pasado este checklist. El agente debe flagear en el output el estado: `DRAFT_AI` (borrador crudo), `IN_REVIEW` (en Google Docs con revision), `READY_TO_PUBLISH` (aprobado).

### Tracking de estado en Google Sheets

La planilla de trabajo del agente debe tener control de estado explicito. Estructura de columnas minima:

| Columna | Descripcion |
|---------|-------------|
| `keyword` | La keyword o tema central del contenido |
| `prompt` | El texto del prompt que se envio a la IA |
| `estado` | Estado del proceso: `pendiente` / `en_proceso` / `en_revision` / `completado` |
| `output_link` | Link al documento Google Docs generado |
| `publicado_url` | URL del articulo ya publicado (vacio hasta que se publique) |
| `fecha_actualizacion` | Para detectar piezas sin movimiento |

**Tip:** usar una fila de ejemplo en la planilla para facilitar el onboarding de nuevos colaboradores y evitar errores de formato.

### Automatizacion del pipeline

El flujo Sheets → IA → Docs → update estado puede automatizarse con herramientas de no-code como n8n (o con scripts en GitHub Actions, que es el scheduler elegido para este proyecto).

**Conceptos del flujo automatizado:**

- **Trigger:** evento que inicia el flujo (ej: nueva fila con estado `pendiente` en Sheets).
- **Nodo de accion:** llamar a la API del LLM con el prompt de la fila.
- **Integracion con Docs:** crear o actualizar el documento con el borrador generado.
- **Actualizacion de estado:** marcar la fila como `en_revision` en Sheets y agregar el link al doc generado.

**Para este proyecto:** usar GitHub Actions para los triggers programados y scripts Node.js para la logica. Ver `scripts/seo/index.js` y `.github/workflows/`. La planilla de Sheets actua como **cola de trabajo** — el agente la lee, procesa las filas `pendiente`, y actualiza el estado al terminar.

### Integracion con flujo del agente

El SEO Agent puede usar IA internamente como parte de su pipeline:
1. **Input:** brief del Consultant + contexto del cliente desde vault.
2. **Fase 1 (ideacion):** genera hipotesis de keywords + temas usando prompts de esta seccion.
3. **Fase 2 (validacion):** cruza con GKP, GSC, Google Trends cuando hay acceso.
4. **Fase 3 (produccion):** genera borrador segun prompt estructurado (tono + extension + puntos + formato).
5. **Fase 4 (revision):** output va a Google Docs con checklist de revision.
6. **Output final:** pieza SEO con estado `READY_TO_PUBLISH` + metadata completa + registro en Sheets/vault.

---

## 8. GEO — Generative Engine Optimization

### El cambio de paradigma

El SEO tradicional ya no alcanza. Los usuarios obtienen respuestas directas de motores de IA (ChatGPT, Perplexity, Google AI Overviews, Gemini) sin hacer clic en ningun resultado. **Hasta el 71% de las busquedas en Google son "sin clic"** (zero-click).

Este cambio crea un nuevo paradigma: **GEO (Generative Engine Optimization)** — optimizar contenido no solo para rankear, sino para **ser citado, resumido y referenciado** por motores generativos.

### Trafico tradicional vs trafico generativo

| Dimension | SEO tradicional | GEO |
|-----------|-----------------|-----|
| **Origen del trafico** | Busqueda + clic en resultado | Interaccion con IA (respuesta directa, resumen, snippet enriquecido) |
| **Comportamiento usuario** | Navegacion clasica (entra al sitio, explora) | Consumo inmediato (obtiene respuesta sin visitar) |
| **Metrica principal** | Clics y CTR | Citabilidad, menciones, presencia en respuestas IA |
| **Objetivo** | Llevar al usuario al sitio | Ser la fuente citada/referenciada |
| **Filosofia** | Mas clics = mas exito | Menos clics, mas interaccion e influencia |

**Implicancia:** las metricas tradicionales subestiman el valor real del contenido en la era IA. Un articulo que es citado por ChatGPT miles de veces puede no generar clics pero construye autoridad, reconocimiento de marca y genera trafico indirecto.

### Nuevos KPIs GEO

| KPI | Que mide |
|-----|----------|
| **Share of Voice IA** | % de respuestas en motores generativos donde la marca aparece (vs competencia). |
| **Citation Ratio** | Ratio de veces que el contenido del sitio es citado como fuente en respuestas IA. |
| **Presence Score** | Puntuacion agregada de presencia de la marca en respuestas IA en el nicho. |
| **Visibilidad sin clic** | Impresiones + apariciones en Featured Snippets, AI Overviews, PAA (el usuario ve la marca aunque no haga clic). |

### Tacticas GEO para el agente

Como adaptar contenido para ser citado por motores generativos:

1. **Answer-first exacerbado** — aun mas directo que para Featured Snippets. Cada seccion debe tener una respuesta clara, autosuficiente y citable en 1-3 oraciones.
2. **Factualidad verificable** — datos, cifras, fechas concretas. Las IAs citan contenido con hechos verificables mas que opiniones.
3. **Estructura semantica clara** — jerarquia H1 > H2 > H3 impecable, listas, tablas, definiciones marcadas. La IA escanea estructura.
4. **Schema markup completo** — ayuda a la IA a entender entidades y relaciones (especialmente `Article`, `FAQPage`, `HowTo`, `Organization`, `Person` con `author`).
5. **Autoridad de entidad** — mencionar explicitamente entidades relevantes (personas, lugares, marcas, conceptos) de forma que la IA pueda asociarlas. Construir paginas `about`, `author`, `organization` solidas.
6. **Citar fuentes propias** — si la marca tiene datos originales, estudios, casos, citarlos desde el contenido. Las IAs valoran contenido que **es** fuente primaria.
7. **Contenido linkeable + mencionable** — mas alla del backlink, crear recursos que las IAs quieran citar. Conecta con la estrategia de Digital PR (seccion 6).

### Regla operativa del agente

- En cada pieza generada, incluir un bloque "Optimizacion GEO" en la metadata del output: respuesta directa citable (1-3 oraciones), hechos verificables destacados, entidades clave mencionadas.
- Cuando se planteen reportes de performance, incluir metricas GEO junto a metricas tradicionales. Si el cliente no tiene aun capacidad de medir GEO, flagearlo como gap y proponer implementacion (herramientas especificas de GEO monitoring estan emergiendo).
- No abandonar SEO tradicional — el GEO lo **complementa**, no lo reemplaza. Un articulo bien optimizado para SEO tradicional tambien tiende a performar bien en GEO si cumple las tacticas de arriba.
