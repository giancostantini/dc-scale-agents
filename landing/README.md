# Landing · Dearmas Costantini

Sitio estático de **Dearmas Costantini · Socios de crecimiento empresarial en LATAM**. Hero centrado con fondo de luz en movimiento, entrada tipográfica y profundidad al scrollear; tipografía original de D&C (Inter + DM Sans), botones dorados, clientes y soluciones. Sin build ni dependencias de producción nuevas.

## Ejecutar localmente

Desde `landing/`:

```sh
npx --yes serve . --listen 8080
```

Abrir **http://localhost:8080**. Usar ese hostname y puerto para las integraciones: el backend permite ese origen; `http://127.0.0.1:8080` no está en su lista CORS. Deploy estático en Vercel: `vercel.json`.

## Estructura actual

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Navegación, hero, logos, secciones de contenido, FAQ, chat y agenda (con su CSS/JS inline de chat, FAQ y Calendly) |
| `styles/theme.css` | Tokens compartidos (colores, radios, sombras), fondo por sección vía `data-tone`, gutters y ritmo |
| `styles/entry-v2.css` | Tipografía y paleta de D&C, hero centrado, efectos de entrada, responsive, menú y marquee |
| `styles/hero-atmosphere.css` | Capas de luz, bandas SVG animadas, máscaras del título y composición móvil del hero |
| `styles/solutions.css` | Capacidades, tabs, paneles y medios del showcase |
| `styles/mundipack-demo.css` / `styles/brainbill-demo.css` | Las dos demos interactivas (clases `mp-*` / `bb-*`) |
| `styles/page-motion.css` | Entradas por elemento y la escena de producto de Soluciones |
| `scripts/entry-v2.js` | Inicialización, menú, navegación, CTA y revelado de bloques al entrar en pantalla |
| `scripts/hero-scroll.js` | Entrada del título, scroll y profundidad, respuesta al cursor, pausa de efectos, estado del header y progreso de página |
| `scripts/marquee.js` | Copia visual del grupo, pausa fuera de pantalla y preferencias de movimiento |
| `scripts/showcase.js` | Render de tabs/paneles, teclado, demos (`media.demo`), imágenes y videos |
| `scripts/page-motion.js` | ÚNICO sistema de movimiento fuera del hero, atado al scroll en los dos sentidos: cada bloque aparece al entrar (`--e`) y se va al salir por arriba (`--x`); parallax de glows y escena de producto (`data-reveal-scene`) |
| `scripts/growth-deck.js` + `styles/growth-deck.css` | Growth & Marketing: cuentas como teléfonos superpuestos, se elige cuál ver. Capturas en `assets/growth/` |
| `scripts/mundipack-demo.js` + `content/mundipack-demo.js` | Demo de Mundipack: Dirección / Vendedores con visitas compartidas entre roles |
| `scripts/brainbill-demo.js` + `content/brainbill-demo.js` | Demo de BrainBill: foto/PDF/XML → lectura → validación → catálogo → revisión humana → entrega |
| **`content/solutions.js`** | **Datos del showcase: Mundipack, BrainBill y Growth & Marketing** |
| `QA-V2.md` | Pruebas realizadas y pendientes externos de esta iteración |

El hero ocupa la primera pantalla con ondas verdes y doradas en varias capas, dibujadas con SVG inline y degradados CSS. Las tres líneas del título entran escalonadas en aproximadamente 1,1 segundos; un barrido de luz recorre el acento dorado. La entrada se completa inmediatamente al scrollear o enfocar un control, y se omite al cargar una sección mediante un anchor.

Al bajar, la escena permanece fija durante 45svh adicionales: el fondo se expande hasta 28%, las bandas se desplazan en otro plano y el título aumenta hasta 10% mientras se desvanece. La transición es reversible al subir. En desktop, las luces responden al cursor con suavizado; en pantallas táctiles, conservan el movimiento autónomo. Los controles completamente desvanecidos dejan de recibir clics y foco.

Las animaciones de fondo se pausan cuando la escena sale de pantalla o la pestaña queda oculta. El controlador JS usa frames bajo demanda para scroll y para el breve asentamiento del cursor. Los títulos y bloques posteriores se revelan al entrar en pantalla; el header adquiere fondo translúcido y muestra el progreso de lectura.

Con `prefers-reduced-motion: reduce`, el hero conserva una composición estática de luz, queda en flujo natural y muestra el contenido sin animación. Sin JavaScript, el fondo y el título también permanecen visibles. El marquee contiene cuatro marcas originales; la repetición se oculta de accesibilidad y desaparece con movimiento reducido. No tiene título ni botón de pausa; el movimiento se detiene al pasar el cursor y cuando sale de pantalla.

Todos los CTA de reunión usan `.book-btn` (caras de los socios + flecha; `is-dark` sobre fondo claro, `is-lg` en el cierre). En Socios, la card grande es el LinkedIn de la firma y los fundadores van abajo, más chicos.

Recorrido: **Hero → Logos → Nuestra firma → Soluciones (demos) → Casos → La pregunta → Valores → Skin in the game → Socios → FAQ → Agenda → Footer**. Los tonos alternan oscuro/claro. Soluciones va arriba a propósito: las demos son el producto estrella y se prueban antes de leer los casos.

## Las demos interactivas

Son recreaciones con **datos 100 % ficticios** (nombres, RUTs, productos, precios); nada se envía ni se guarda fuera de la visita. Cada una se elige en `content/solutions.js` con `media: { type: 'demo', demo: 'mundipack' | 'brainbill' }`.

- **Mundipack**: dos roles. Dirección (dashboard, vendedores, clientes, productos, cobranzas, rutas) y Vendedores (hoy, ruta, cartera, oportunidades, lista de precios, presupuesto, progreso). "Ver como" cambia de vendedor. Las visitas son una sola fuente: lo que marca el vendedor aparece en Rutas de Dirección.
- **BrainBill**: seis pasos. Elegís una factura (foto, PDF o XML del CFE), se lee (con IA o exacta desde el XML), se valida (aritmética, IVA, RUT, duplicados), se asocia al catálogo con precio sugerido (margen ajustable), una persona confirma (el producto dudoso y la advertencia del total bloquean hasta revisarlos) y se entrega al destino elegido.

**Escena de producto**: en desktop (≥1000px) la demo visible entra acompañando el scroll (escala, inclinación y opacidad según `--reveal`) y queda plana y nítida al completarse. En mobile y con movimiento reducido no hay escena: se ve directo.

## Cargar assets reales del showcase

Crear estas carpetas al incorporar el primer archivo; todavía no contienen material real:

```text
landing/
  assets/solutions/
    mundipack/
      principal.webp
      demo.mp4
      poster.webp
      subtitulos.es.vtt
    growth/
      principal.webp
      demo.mp4
      poster.webp
      subtitulos.es.vtt
  logos/
    propios.png
```

No es necesario entregar todos los formatos. **Cada solución admite un medio principal: una imagen o un video.** Los nombres de arriba son la convención propuesta; `src` determina el archivo que se usa.

### Reemplazar un placeholder por una imagen

En el objeto correspondiente de `content/solutions.js`, reemplazar únicamente `media`:

```js
media: {
  type: 'image',
  src: 'assets/solutions/mundipack/principal.webp',
  alt: 'Descripción concreta de lo que muestra la captura real',
  caption: 'Pie de imagen aprobado para esta captura',
  width: 1600,
  height: 1000,
},
```

Las rutas son relativas a `landing/index.html`, no a `content/`. Con `type: 'placeholder'` o sin `src` se conserva el espacio reservado. No hace falta cambiar el renderer ni el CSS.

### Reemplazarlo por un video

```js
media: {
  type: 'video',
  src: 'assets/solutions/sistema-dc/demo.mp4',
  poster: 'assets/solutions/sistema-dc/poster.webp',
  alt: 'Descripción del recorrido mostrado en el video',
  caption: 'Pie de video aprobado',
  width: 1600,
  height: 900,
  captions: {
    src: 'assets/solutions/sistema-dc/subtitulos.es.vtt',
    language: 'es',
    label: 'Español',
  },
},
```

`poster` y `captions` son opcionales; incluir subtítulos cuando exista voz o información sonora relevante. El video tiene controles, reproducción inline, sin autoplay y `preload: none`; se pausa al cambiar de solución.

**Recomendaciones:** capturas de 1600×1000 (16:10) o 1920×1200; videos 1600×900 o 1920×1080 (16:9). Usar las dimensiones reales en `width` / `height`: también controlan la proporción del espacio. WebP para imágenes optimizadas, PNG si la legibilidad de la interfaz lo requiere; MP4 H.264 para video, WebP/JPG para poster y WebVTT para subtítulos. Apuntar a imágenes de 300–600 KB cuando sea posible y clips breves. El medio se muestra completo, sin estirarlo ni recortarlo.

### Campos de contenido y nuevas soluciones

- `id`: identificador único, estable, sin espacios (por ejemplo, `sistema-dc`).
- `name`: etiqueta del tab; `category`: área; `status`: estado real del trabajo.
- `title` / `description`: presentación breve.
- `audience`, `challenge`, `work`, `outcome`: usuario, problema, construcción y utilidad. Distinguir objetivos de resultados obtenidos.
- `media`: configuración anterior.

Para agregar una solución, duplicar un objeto dentro de `solutions`, completar esos campos y crear `assets/solutions/<id>/`. El orden del array define tabs y paneles; IDs y controles de teclado se generan automáticamente. Actualizar también el resumen de `.showcase-fallback` en `index.html` para visitantes sin JavaScript. 

### Logo original de Pinturería Propios

El actual `logos/propios.png` fue extraído del material existente del cliente. Si llega un PNG, reemplazar ese archivo y ajustar `width` / `height` del `<img class="brand-propios">` a sus dimensiones reales. Si llega un SVG, guardarlo en `logos/propios.svg` y cambiar su `src` en `index.html`. La copia del marquee se genera sola. Preferir original transparente y sin márgenes grandes.

## Pendientes externos / siguiente entrega

- Capturas o videos finales de Growth (Mundipack y BrainBill ya tienen demo interactiva), con selección del medio principal, descripción y pie aprobado por solución. Posters/subtítulos si aplica.
- SVG/PNG original de Propios.
- URL correcta de LinkedIn de la firma (la anterior devolvía 404); confirmar también los perfiles de los socios, que bloquean la verificación automatizada.
- Chat: la API desplegada devuelve su mensaje de error técnico; revisar el error `[chat] stream error` en el backend. La UI de conversación y el acceso a agenda fueron probados.
- Newsletter: deshabilitado y marcado como próximo hasta conectar un backend; no simula suscripciones.
- Se conservan los pendientes editoriales previos: validar testimonios heredados. Confirmar tipo de reunión, preguntas y webhook de Calendly antes del lanzamiento.
