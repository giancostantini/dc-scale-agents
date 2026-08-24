# Sitio · Pinturería Propios

One-pager institucional del cliente **Pinturería Propios** (Buceo, Montevideo).
Mismo patrón que `landing/` y `kickoff/`: HTML + CSS vanilla, un solo archivo, sin build.

Vive en `sites/` porque es un sitio **de cliente**, no una propiedad de la agencia.

## Deploy

Proyecto de Vercel aparte, con **Root Directory = `sites/pintureria-propios`**.
Dominio: `pintureriapropios.com.uy` (a registrar — al 2026-08-24 estaba libre).

## Antes de publicar — pendientes bloqueantes

Están listados arriba de todo en `index.html`, en el bloque "DATOS A CONFIRMAR":

1. **Horarios** — los actuales salen de directorios de terceros. Van en el sitio Y en el
   JSON-LD que lee Google: si están mal, la gente va y encuentra cerrado.
2. **WhatsApp** — buscar `WHATSAPP_PENDIENTE`. El 2613 0815 es fijo, hace falta un 09x.
3. **Años de trayectoria** — un directorio dice 22 años. Sin confirmar, no se publicó.
4. **Marcas** que trabajan — la sección existe comentada en el HTML.
5. **Logo** — hay un placeholder SVG con la paleta. Falta el vector real.
6. **¿Uno o dos locales?** — hay directorios que listan también el 1694.

## Notas técnicas

- El JSON-LD es `HardwareStore` (cubre los tres rubros mejor que `PaintStore`) y apunta al
  mismo Place ID que el QR de reseñas: `ChIJ_VJqXSSBn5UR4XwZUpgyYm8`.
- **No se incluyó `aggregateRating` en el schema a propósito.** Google penaliza el rating
  autodeclarado en la propia web; la calificación tiene que venir de la ficha.
- El mapa usa el embed sin API key (`maps.google.com/maps?...&output=embed`). Si algún día
  deja de andar, el botón "Abrir en Google Maps" sigue funcionando.
- Paleta tomada del logo de Instagram (150 px): azul `#123A8F`, amarillo `#FFD100`,
  rojo `#D81E05`. Confirmar contra el vector original.
