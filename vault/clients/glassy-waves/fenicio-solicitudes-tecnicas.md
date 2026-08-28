# Glassy Waves — Paquete de solicitudes técnicas para Fenicio

**Para:** Soporte / partner de Fenicio de Glassy Waves
**De:** Equipo Glassy Waves (D&C Scale Partners)
**Fecha:** 2026-07-13
**Contexto:** tras una auditoría de e-commerce necesitamos aplicar una serie de mejoras que dependen de la **plantilla/tema** (HTML/CSS/JS) y de **configuraciones del motor**, que no podemos editar desde el backoffice de contenido. Abajo va cada pedido con el spec exacto, ejemplo y criterio de aceptación.

**Plataforma detectada:** Fenicio + GoPersonal. Medios en CDN `f.fcdn.app`. Sitio `es`, moneda UYU.

> **Antes que nada — preguntas de capacidad (bloquean el orden de trabajo):**
> 1. ¿Podemos editar el `<meta viewport>` y el CSS de la plantilla? (pedido 2.1)
> 2. ¿El buscador soporta **tolerancia a errores/sinónimos** y podemos editar la **página de "sin resultados"**? (2.3)
> 3. ¿Se pueden habilitar **filtros por talle/color** y **ordenamiento** en los listados? (2.4)
> 4. ¿Podemos inyectar **JSON-LD** y **breadcrumbs** en las plantillas de home/categoría/producto? (2.5)
> 5. ¿Se puede controlar el **canonical de URLs con filtros** y excluirlas del sitemap? (2.5)
> 6. ¿Existe **compra como invitado** (guest checkout)? (2.7)
> 7. ¿Podemos insertar un **dataLayer** de GA4 enhanced-ecommerce en la plantilla? (2.8)
>
> Cualquiera de estos que sea **config de backoffice** (no plantilla), decínoslo y lo hacemos nosotros.

---

## 2.1 — Habilitar zoom en móvil + agrandar áreas táctiles (PRIORIDAD ALTA)

**Problema:** el `<meta viewport>` actual bloquea el zoom y varios controles táctiles son chicos.

**Evidencia (medida el 2026-07-13 a 375px):**
- `viewport = "width=device-width, initial-scale=1.0, maximum-scale=1,user-scalable=no"` → **impide pinch-zoom** (barrera de accesibilidad, WCAG 1.4.4).
- Selector de talle en la ficha: **30×30px**. Botón "Comprar": **40px de alto**. Recomendado mínimo: **44×44px**.

**Spec:**
1. Cambiar el meta viewport a:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
   ```
   (quitar `maximum-scale=1` y `user-scalable=no`).
2. CSS para áreas táctiles (aplicar a los selectores reales de la plantilla; ejemplo orientativo):
   ```css
   /* Botones de talle (radios estilizados) en la ficha */
   .ficha .talles label { min-width: 44px; min-height: 44px; display: inline-flex;
     align-items: center; justify-content: center; }
   /* Botón principal de compra */
   .ficha .btn-comprar { min-height: 48px; font-size: 15px; }
   /* Pisos de tamaño de fuente en enlaces/labels secundarios */
   .ficha a.guia-talles, .ficha .precio-secundario { font-size: 13px; }
   ```

**Criterio de aceptación:** el pinch-zoom funciona en iOS/Android; los talles y el botón de compra miden ≥44px; la "Guía de talles" es legible (≥13px).

---

## 2.2 — Layout de precio en tarjetas (PRIORIDAD ALTA)

**Problema:** en las tarjetas de listado y home se muestran hasta **4 números sin etiqueta** (ej. Hoodie Original `$1.758  $2.790  $1.231  $1.406`). El comprador no sabe cuál paga. En la ficha sí están etiquetados (venta, lista, BBVA 30%, BBVA 20%).

**Spec de jerarquía en la tarjeta:**
- **Precio de venta** (grande, destacado): `$1.758`
- **Precio de lista** tachado (chico, gris): `$2.790`
- **Chip de descuento**: `−37%`
- **Una** línea de beneficio bancario, etiquetada: `BBVA hasta 30% OFF → $1.231` (no mostrar los dos escalones BBVA como números sueltos).

**Ejemplo de markup objetivo:**
```html
<div class="card-precio">
  <span class="precio-venta">$1.758</span>
  <span class="precio-lista">$2.790</span>
  <span class="precio-off">−37%</span>
  <span class="precio-bbva">BBVA hasta 30% OFF → $1.231</span>
</div>
```

**Criterio de aceptación:** cada tarjeta muestra venta + tachado + %OFF + una línea BBVA etiquetada; nunca 3-4 números crudos sin rótulo.

---

## 2.3 — Buscador: tolerancia a errores + página de "sin resultados" (PRIORIDAD ALTA)

**Problema (verificado):** `/catalogo?q=remera` devuelve 39 resultados, pero `/catalogo?q=remra` (un typo) devuelve **0** con una página sin salida: *"¡Lo sentimos! No hay productos en esta sección."* — sin sugerencias, sin productos, sin categorías.

**Spec:**
1. **Activar tolerancia a errores/sinónimos** en el buscador (si Fenicio lo soporta). Casos objetivo: "remra"→remera, "buso"→buzo, "campera"/"camperas", "bikini"/"bikinis".
2. **Rediseñar la página de cero resultados** con vías de recuperación. Copy propuesto:
   > **No encontramos "{término}"… pero no te vayas con las manos vacías.**
   > Probá con otra palabra o mirá estas opciones:
   > - **Categorías:** Vestimenta · Bikinis · Gorras · Calzado · Accesorios
   > - **Lo más buscado:** [grilla de 4–8 productos destacados / más vendidos]
   > - ¿Necesitás ayuda? **Escribinos por WhatsApp** → https://api.whatsapp.com/send?phone=59892039029

**Criterio de aceptación:** un typo de una letra devuelve resultados o sugerencias; la página de cero resultados ofrece categorías + productos + WhatsApp (no es un callejón sin salida).

---

## 2.4 — Filtros (talle/color) + ordenamiento en listados

**Problema:** en `/vestimenta` (117 productos) y `/catalogo` (163) el único filtro visible es **precio** (Desde/Hasta) y **no hay ordenamiento**. Existen URLs de filtro por color/marca (`?color=`, `?marca=`) pero no como controles visibles.

**Spec:**
- Exponer filtros facetados de **Talle** y **Color** (además de precio) en la barra de filtros.
- Agregar selector **"Ordenar por"**: Novedades · Precio (menor→mayor) · Precio (mayor→menor) · Más vendidos.

**Criterio de aceptación:** los listados permiten filtrar por talle y color y ordenar; funciona en desktop y móvil.

---

## 2.5 — SEO técnico: H1, JSON-LD, breadcrumbs, canonical de facets

**Problemas verificados:** home **sin H1** (`h1count=0`); **sin JSON-LD** en todo el sitio; microdata de producto con `availability` vacío; **sin breadcrumbs**; URLs de filtro (`?color=`) **indexables, auto-canónicas y en el sitemap**.

### (a) H1 en home
Agregar un H1 semántico (puede ir oculto visualmente si rompe el diseño): `Ropa surf uruguaya | Glassy Waves`.

### (b) JSON-LD (plantillas — bindear a los campos reales de Fenicio)
**Producto** (plantilla de ficha; ejemplo con datos reales del Hoodie):
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{{producto.nombre}}",
  "image": ["{{producto.imagenPrincipalURL}}"],
  "description": "{{producto.descripcion}}",
  "sku": "{{producto.sku}}",
  "brand": { "@type": "Brand", "name": "Glassy Waves" },
  "offers": {
    "@type": "Offer",
    "url": "{{producto.urlCanonica}}",
    "priceCurrency": "UYU",
    "price": "{{producto.precioVenta}}",
    "availability": "{{producto.enStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'}}",
    "itemCondition": "https://schema.org/NewCondition"
  }
}
```
> Clave: poblar **`availability`** (hoy va vacío) y, cuando existan reseñas (Ola 3), agregar `aggregateRating`.

**BreadcrumbList** (ficha y categoría):
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://glassywaves.com.uy/" },
    { "@type": "ListItem", "position": 2, "name": "{{categoria.nombre}}", "item": "{{categoria.url}}" },
    { "@type": "ListItem", "position": 3, "name": "{{producto.nombre}}" }
  ]
}
```

**Organization** (home; incluir tiendas físicas):
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Glassy Waves",
  "url": "https://glassywaves.com.uy/",
  "logo": "https://glassywaves.com.uy/public/web/img/logo-og.png",
  "sameAs": ["[COMPLETAR: URL Instagram]", "[COMPLETAR: URL Facebook]"],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+598 92 039 029",
    "contactType": "customer service"
  }
}
```

### (c) Breadcrumbs visibles
Mostrar migas de pan (Inicio › Categoría › Producto) en ficha y categoría, alineadas con el JSON-LD de BreadcrumbList.

### (d) Canonical de URLs con filtros + sitemap
- Que `/{categoria}?color=…` (y `?marca=…`) canonicen a la **categoría base** (`/{categoria}`), o lleven `noindex,follow`.
- **Quitar** las permutaciones de filtro del sitemap (`catalogo.xml`); dejar solo categorías y productos canónicos.

**Criterio de aceptación:** home con H1; Rich Results Test valida Product/Offer(availability)/Breadcrumb/Organization; breadcrumbs visibles; `?color=` no indexable/canoniza a la base y no está en el sitemap.

---

## 2.6 — Barra de progreso a envío gratis

**Depende de 2.6-config (nosotros):** definiremos e ingresaremos el **umbral de envío gratis** en las reglas de envío. Pedido de plantilla: mostrar una **barra de progreso** en el mini-cart y el checkout:
> "Te faltan **$X** para el envío gratis" → al alcanzarlo: "🎉 ¡Tenés envío gratis!"

**Criterio de aceptación:** la barra aparece y se actualiza según el subtotal vs. el umbral configurado.

---

## 2.7 — Compra como invitado / optimizar OTP

**Problema:** el checkout (`/mi-compra`) exige identificarse por **email + código OTP de 6 dígitos** o Google; no hay opción de invitado.

**Spec:** habilitar **compra como invitado** (avanzar sin crear cuenta; opcional crear cuenta al final). Si no es posible, optimizar el paso: copy más claro, auto-focus y auto-avance entre los 6 dígitos, y botón visible de "Reenviar código".

**Criterio de aceptación:** se puede completar la compra sin crear cuenta, o el paso de OTP queda optimizado (auto-avance + reenvío claro).

---

## 2.8 — dataLayer de GA4 (enhanced-ecommerce)

**Contexto:** vamos a configurar GA4/GTM (pegaremos el ID en el campo de integraciones). Pedido de plantilla: emitir eventos de e-commerce al `dataLayer`:
`view_item`, `view_item_list`, `add_to_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` — con `items` (id, nombre, categoría, precio, cantidad) y `value`/`currency=UYU`.

**Criterio de aceptación:** el embudo completo se ve en GA4 (de vista de producto a compra) con `value` y `currency` correctos.

---

## Resumen de prioridades

| Pedido | Prioridad | Dimensión que sube |
|---|---|---|
| 2.1 Zoom + tap targets | Alta | Móvil |
| 2.2 Layout de precio | Alta | Ficha/CRO |
| 2.3 Buscador + sin-resultados | Alta | Navegación |
| 2.5 SEO técnico (H1/JSON-LD/breadcrumbs/canonical) | Alta | SEO técnico |
| 2.8 dataLayer GA4 | Alta | Medición |
| 2.4 Filtros + orden | Media | Navegación |
| 2.6 Barra envío gratis | Media | CRO/ticket |
| 2.7 Guest checkout | Media | Checkout |

*Los ítems que confirmen como config de backoffice (no plantilla) los aplicamos nosotros directamente.*
