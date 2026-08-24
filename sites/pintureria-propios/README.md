# Sitio · Propios — Pinturería y Ferretería

One-pager del cliente **Propios** (Buceo, Montevideo). HTML estático, sin build.
Vive en `sites/` porque es un sitio **de cliente**, no una propiedad de la agencia.

```
sites/pintureria-propios/
  index.html
  assets/logo.png
  vercel.json
```

## Deploy

Proyecto de Vercel aparte, con **Root Directory = `sites/pintureria-propios`**.
Comando de build: ninguno. Dominio: `pintureriapropios.com.uy` (a registrar — al
2026-08-24 estaba libre).

## De dónde salió

El diseño lo generó Claude Design a partir de la Estrategia e Identidad de Marca 2026
del cliente (texto en `vault/clients/pintureria-propios/brand/_fuente-estrategia-2026.md`).
Al traerlo al repo se le hicieron estos arreglos:

- **Los dos botones de Google apuntaban a una búsqueda de Maps.** Ahora usan el Place ID:
  el de reseñas abre el formulario (`search.google.com/local/writereview?placeid=…`) y el
  otro abre la ficha exacta (`maps/place/?q=place_id:…`). Un link de búsqueda puede caer
  en otra pinturería de la zona y no abre el formulario de reseña.
- **`hasMap` con el Place ID agregado al JSON-LD** — es lo que ata este sitio con la ficha.
- **Coordenadas afinadas** a `-34.89319, -56.12931`, decodificadas del plus code `4V4C+P7`
  de la ficha. Las originales estaban a 28 m. El schema y Leaflet usan las mismas.
- **Códigos de color inventados eliminados** (N° 214, N° 118, …). Eran de muestra: un
  cliente podía venir al mostrador a pedir un código que no existe. Quedan los nombres.
- `canonical`, `og:url`, `og:locale` agregados.
- Botón "Llamar" del header: 40 → 44 px de alto, el mínimo para tocar en mobile.

## Dependencias externas (CDN)

- Google Fonts: **Anybody** (display, eje de ancho variable) + **Instrument Sans** (texto).
- **Leaflet 1.9.4** + tiles de OpenStreetMap para el mapa. Con SRI y `crossorigin`.

Si se quiere cero dependencias externas hay que autoalojar las fuentes y Leaflet, o
cambiar el mapa por una imagen estática enlazada a Google Maps.

## Estilos

Estilos inline en cada elemento. El `<style>` del `<head>` solo tiene reset, foco visible
y los `:hover` (clases `.hvN`, con `!important` porque compiten con los inline).
Sin framework CSS.

## Pendientes antes de publicar

El detalle está arriba de todo en `index.html`, en el bloque "DATOS A CONFIRMAR":

1. **Horarios** — salen de directorios de terceros. Van en la página y en el JSON-LD.
2. **WhatsApp** — no hay. El 2613 0815 es fijo, falta un celular 09x.
3. **Logo** — `assets/logo.png` es PNG de 500×500. Alcanza para web, **no para imprenta**
   (el cartel de mostrador sigue necesitando el vector).
4. **Marcas** que trabajan — falta la lista, no hay sección.
5. **Fotos** — la página no usa ninguna. Los bloques de color del hero y de "Tu color"
   están pensados para reemplazarse por fotos reales del local, como pide la estrategia.
6. **og:image** — hoy es el logo cuadrado; conviene una imagen 1200×630.
7. **¿Uno o dos locales?** — hay directorios que listan también el 1694.
8. `sitemap.xml` y `robots.txt` — cuando el dominio esté arriba.

## No tocar sin entender qué se rompe

- El Place ID `ChIJ_VJqXSSBn5UR4XwZUpgyYm8` aparece en tres lugares: `hasMap` del JSON-LD,
  el botón de reseñas y el de Google Maps. Es el mismo que codifica el QR del mostrador
  (`vault/clients/pintureria-propios/entregables/`).
- **Sin `aggregateRating` en el JSON-LD a propósito**: Google penaliza el rating
  autodeclarado en la propia web. El 4,6 con 250 opiniones se muestra como texto, no
  como dato estructurado.
- El 4,6 / 250 es un dato **estático**: hay que actualizarlo a mano cuando cambie.
