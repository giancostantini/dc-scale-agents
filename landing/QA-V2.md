# Landing · Pruebas de interfaz

## Revisión 2026-09-23 · Demos interactivas (Mundipack + BrainBill)

- **Bug corregido:** el script inline usaba `#bgCanvas`, que ya no existía; al cargar tiraba `TypeError` y dejaba muertos el FAQ, el chat y el newsletter. Confirmado en Chrome antes y después (el FAQ ahora abre).
- Un solo sistema de movimiento (`page-motion.js` + `hero-scroll.js`): fuera el `.reveal` y el parallax viejos, que se pisaban. Poda de ~1300 líneas de CSS muerto con alturas de sección idénticas antes/después a 1440 y 390 px.
- **Mundipack:** recorrido completo en los dos roles; "Ver como" cambia de vendedor; una visita marcada por Sofía aparece al instante en Rutas de Dirección ("Todo el equipo": 10 paradas y 10 pines); barras con alturas por mes y resaltado del período; ficha con historial y última compra; stock bajo; Progreso semanal.
- **BrainBill:** recorrido completo con las tres facturas: lectura animada con campo resaltado en la factura, 7 validaciones con la advertencia del total en la foto, precio sugerido que cambia con el margen, confirmación bloqueada hasta elegir el producto dudoso y tildar la advertencia, entrega con cola → enviando → cargada y tiempo total. XML: chips "Firmado" (lectura sin IA).
- **Escena de producto:** `--reveal` 0,06 → 0,26 → 0,66 → 1 al scrollear; al completarse la demo queda con `transform: none` (texto nítido). Probado forzando frames porque el panel de pruebas estaba oculto; conviene mirarla en un navegador real.
- Sin desbordes horizontales a 320, 390 y 768 px con las dos demos en todos sus pasos (solo sobresalen los glows decorativos, recortados por su sección).
- Pendiente: revisión visual en dispositivo físico y con movimiento reducido real del sistema operativo.

## Última revisión · Hero cinematográfico

- Fondo SVG/CSS propio, con cinco animaciones independientes de luz y bandas verdes/doradas. Revisadas capturas de entrada, composición completa, movimiento autónomo y transición al scroll a 1440, 390 y 320 px.
- **16 configuraciones responsive en Chrome/Playwright:** 1920×1080, 1440×900, 1366×700, 1024×768, 768×1024, 390×844, 320×700 y 844×390, cada una con movimiento normal y reducido. Las de 390 y 320 px incluyen emulación táctil.
- Entrada terminada con las tres líneas legibles, Inter cargada y título centrado. CTA dentro de la primera pantalla en las alturas probadas de 700 px o más. Sin errores JS, warnings, recursos locales faltantes ni desbordes horizontales.
- Scroll comprobado en 0/25/50/75/100%: opacidad aproximada 1 / .89 / .5 / .11 / 0, tramo fijo, cambio de escala y restauración completa al volver al inicio. CTA y enlace inferior inaccesibles cuando se desvanecen completamente.
- Movimiento autónomo comprobado comparando la transformación de las bandas en momentos distintos, también en móvil. Respuesta al cursor y retorno al centro al salir del hero comprobados en desktop.
- Pausa fuera de pantalla verificada: la transformación deja de cambiar; reanudación al volver. Cambio de movimiento reducido durante la visita: escena estática, título visible y desaparición del tramo fijo.
- Acceso al formulario de agenda, cierre con Escape y enlace hacia los clientes probados en la matriz. Revisadas las secciones posteriores para detectar desbordes.
- Sin JavaScript a 1440, 390 y 320 px: título y composición visibles, fondo pausado y sin desbordes.
- Muestra local de fluidez con el fondo activo a 1440×900: 121 frames en aproximadamente 2 segundos, mediana de 16,7 ms y percentil 95 de 17 ms entre frames. Medición de Chrome local, no de un dispositivo móvil físico.

La revisión anterior de identidad y los ensayos de integraciones se conservan como historial.

## Revisión 2026-09-15 · Identidad D&C y scroll

Validación en Chrome mediante Playwright y revisión de capturas desktop/mobile:

- **20 recorridos completos:** 1920×1080, 1440×900, 1366×768, 1366×700, 1024×768, 768×1024, 390×844, 360×800, 320×700 y 844×390; cada uno con movimiento normal y reducido. Sin overflow horizontal, errores JS, warnings ni recursos locales faltantes.
- Hero con Inter cargada, frase centrada y CTA dorado dentro de la primera pantalla en las alturas de 700 px o más. Verificado el tramo fijo y el desvanecimiento en 0/25/50/75/100% (opacidad aproximada 1 / .84 / .5 / .16 / 0), incluyendo el regreso al inicio.
- Revelado de bloques comprobado antes, durante y después de la entrada; recorrido completo sin contenido oculto al terminar.
- Orden DOM: logos y casos de clientes antes de Soluciones. Ausencia del bloque de perspectivas, título de empresas, control de pausa, cupos y card de política de referencias. Anchors sin destinos rotos.
- Agenda: apertura del preform, Escape y devolución de foco al CTA. Menú móvil, navegación hacia Soluciones, enlaces de capacidades, tabs (Home/End/flechas) y FAQ probados a 1440, 390 y 320 px.
- Marquee en movimiento, pausa al hover y cuatro logos estáticos con movimiento reducido. Cambio de preferencia de movimiento durante la visita comprobado.
- Sin JavaScript: hero y fuentes legibles, navegación, cuatro logos, resumen de soluciones y FAQ disponibles; sin desbordes a 1440, 390 y 320 px.

Esta revisión de agenda cubre el acceso al formulario y su navegación. Las comprobaciones de integraciones externas del 14 de septiembre se documentan en el historial siguiente.

## Historial · V2 anterior

**2026-09-14.** Continuación del trabajo existente. Verificado con Chrome real mediante Playwright y revisión de capturas locales. Sin assets finales agregados.

## Matriz completada

Cada viewport se recorrió completo con movimiento normal y con `prefers-reduced-motion: reduce`:

| Desktop | Tablet | Mobile |
|---|---|---|
| 1920×1080 | 1024×768 | 390×844 |
| 1440×900 | 768×1024 | 360×800 |
| 1366×768 | | 320×700 |

- Sin overflow horizontal, recursos locales faltantes, errores JS ni warnings de carga en esa matriz. Fuentes locales y logos cargados.
- Hero revisado en 0/25/50/75/100% del recorrido: CTA accesible, cuatro capacidades completas, sin cruces con el cierre. Sticky de 210svh total; recorrido fijado de aproximadamente 1,1 viewport. Rueda, PageDown, scroll inverso y salida natural probados. Composición estática también comprobada a 1366×700.
- Marquee: movimiento uniforme de 28 px/s; pausa/reanudación con clic, Space y Enter; continuidad de la unión comprobada a ambos lados del final del ciclo. Un solo grupo accesible. Con reduce, cuatro logos estáticos (2×2 en mobile), sin copia ni control de animación.
- Showcase: los tres tabs, flechas, Home/End, Tab/Shift+Tab, enlaces desde CRECER/ESCALAR y avisos de material pendiente. Datos siguen en `content/solutions.js`; no se agregaron interfaces ni métricas simuladas.
- Menú, agenda, FAQ, cupos, footer y chat recorridos por teclado. Foco visible, cierre y restitución del foco. Emulación móvil con touch adicional a 390 px.
- Cambio de reduced motion durante la visita probado a 1440, 768, 390 y 320 px. Contenido sin JS visible: hero, cuatro marcas, resumen del showcase, secciones y respuestas FAQ.
- Revisadas Nuestra firma, La pregunta, Skin in the game y todas las secciones posteriores, incluyendo contenido inferior de bloques altos.

## Correcciones de esta sesión

- Contención horizontal del hero; composición más compacta en pantallas bajas para que Ejecución y la línea final no se superpongan.
- Fondos estables por sección heredada: La pregunta y Skin ya no pierden contraste cuando el canvas pasa a marfil. Los bloques se revelan una vez y no vuelven a ocultar contenido al retroceder.
- Corrección del selector que dejaba visible la copia del marquee en mobile con reduce. Integración del fondo blanco del PNG provisional de Propios sobre marfil.
- Alineación de tabs mobile y ajuste para permitir nuevas entradas sin forzar una fila desbordada.
- Preform de agenda en `dialog` nativo, contención/restauración de foco, validación de campos y email; tamaños ajustados a mobile. Calendly real dentro de un marco nativo con botón Cerrar accesible.
- FAQ y cupos son botones; agenda del footer tiene href. Chat cerrado fuera del orden de foco, Escape y restitución, prevención de envíos simultáneos y timeout. Corregida una carrera del render de streaming que borraba el CTA al finalizar respuestas rápidas.
- Retirado el enlace corporativo de LinkedIn que devolvía 404. Newsletter muestra que aún no está habilitado, en lugar de confirmar una suscripción inexistente.

## Integraciones: alcance y límites de la prueba

- Anchors: todos tienen destino; no quedan enlaces a Proceso/Modelo. Privacidad y Términos: HTTP 200. Glassy Waves, Wiz Trip, Instagram y Calendly: HTTP 200.
- LinkedIn corporativo: 404 confirmado en navegador, enlace retirado. Perfiles personales: HTTP 999 (bloqueo a automatización); requieren confirmación manual, no se reemplazaron por URLs supuestas.
- Calendly: marco responsive comprobado en los ocho tamaños; widget real, parámetros de prefill y salida por teclado probados. A 1440 y 320 px se abrió el evento de 30 minutos y se verificó el selector real de fechas disponibles. El POST de prueba de leads se interceptó localmente; no se creó un lead ni se reservó una reunión. Persistencia del lead y webhook no verificados de extremo a extremo.
- Escape cierra los diálogos propios. Dentro del iframe externo las teclas pertenecen a Calendly: Shift+Tab permite volver al botón Cerrar del marco; allí funcionan Escape, Enter y Space. No se controla el DOM interno del proveedor.
- Chat: desde `localhost:8080`, conexión real HTTP 200, pero el cuerpo es el fallback técnico del servidor. La generación IA **no quedó operativa/verificada**. Desde `127.0.0.1:8080` el backend rechaza CORS; usar localhost. También se probó una respuesta de error aislada para verificar el CTA hacia agenda y su estabilidad al terminar el streaming.
- Prueba responsive en navegador/emulación; no sustituye una comprobación física en Safari/iOS. No se realizó una auditoría WCAG completa.

Carga de assets y campos exactos: [README.md](README.md#cargar-assets-reales-del-showcase).
