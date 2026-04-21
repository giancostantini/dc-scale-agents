# Landing · Dearmas Costantini

Landing oficial pública de **Dearmas Costantini · Business Growth Partners · LATAM**. Single-file HTML orientado a conversión a Calendly.

## Deploy

Sitio estático. Se despliega con Vercel igual que `kickoff/` — ver `vercel.json` para la config.

## Configuración pendiente

1. **Calendly**: reemplazar la constante `CALENDLY_URL` al final del `<script>` con el link real.
2. **Cupos disponibles**: actualizar manualmente cuando cambie el número. Lugares a editar:
   - Stat del hero (`id="cupo-disponibles"`)
   - Grid de slots en la sección `#cupo` (clase `.available` en los divs correspondientes)
   - Resumen de cupo (`.cs-num` y texto)
3. **Testimonios de casos**: los quotes de Glassy Waves, Wiz Trip y caso IA son placeholders editoriales. Confirmar con los clientes antes de publicar en producción.

## Stack

HTML + CSS + JS vanilla. Sin build. Fuentes: Google Fonts (Inter + DM Sans). Widget: Calendly oficial.
