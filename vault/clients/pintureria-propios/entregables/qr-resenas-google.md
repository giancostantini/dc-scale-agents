# QR de reseñas de Google — Pinturería Propios

_Entregable D&C Scale Partners · 2026-08-24_

Pieza de mostrador para que los clientes dejen reseñas en Google al terminar la compra.
QR directo, sin página intermedia, sin filtro de opiniones.

---

## Datos de la ficha

| | |
|---|---|
| Place ID | `ChIJ_VJqXSSBn5UR4XwZUpgyYm8` |
| Nombre en Google | Pinturería Propios |
| Categoría actual | Paint store (pinturería) |
| Dirección | Bv. José Batlle y Ordóñez 1738 esq. Ramón Anador, Buceo, 11400 Montevideo |
| Teléfono | 2613 0815 |
| Estado | **Sin reclamar** al 2026-08-24 |
| Sitio web vinculado | Ninguno (`pintureriapropios.com.uy` no resuelve) |
| Instagram | [@pintureriapropios](https://www.instagram.com/pintureriapropios/) |

### URL que codifica el QR

```
https://search.google.com/local/writereview?placeid=ChIJ_VJqXSSBn5UR4XwZUpgyYm8
```

Desde un celular con sesión de Google abierta, abre directamente el formulario de reseña
con las estrellas.

**Por qué esta URL y no un acortador:** es un dominio de Google y el Place ID no cambia
aunque cambien nombre, horarios o dueño. Un `bit.ly` que se cae o cambia de manos deja
todos los carteles impresos inservibles. **Nunca acortar esta URL.**

---

## Archivos

| Archivo | Para qué |
|---|---|
| `qr/qr.svg` | Vector, dimensionado a 40 mm. Es el master para imprenta |
| `qr/qr-1200.png` | Digital: WhatsApp, redes, mails |
| `qr/qr-2400.png` | Imprenta que solo acepte raster |
| `qr/qr.txt` | La URL exacta + parámetros, para poder auditar el QR más adelante |
| `cartel-mostrador.html` | La pieza A6 lista para exportar a PDF |

Se regeneran con:

```bash
node scripts/qr-review/index.js --client pintureria-propios --place-id ChIJ_VJqXSSBn5UR4XwZUpgyYm8
```

---

## Especificaciones del QR

| Parámetro | Valor |
|---|---|
| Versión | 8 (49 × 49 módulos) |
| Corrección de error | **Nivel H** (30 % de redundancia) |
| Máscara | 3 (elegida por penalty score) |
| Quiet zone | 4 módulos |
| Tamaño impreso | **40 mm** de lado → 0,70 mm por módulo |

**Nivel H** porque la pieza va a un mostrador de pinturería: aguanta roce, manchas y hasta
un logo al centro que tape hasta el 25 % del área.

**40 mm** porque la regla práctica es que la distancia de escaneo ≈ 10 × el lado del QR.
A 40 mm escanea cómodo desde 40 cm, que es la distancia real de alguien parado en la caja.
**No reducirlo por debajo de 30 mm.**

**Quiet zone de 4 módulos**: es el error de imprenta más común. Si recortan el margen
blanco, el QR deja de leerse.

### Verificación hecha (2026-08-24)

Los PNG de 1200 y 2400 px se decodificaron con un decoder independiente:

- Format info válido (BCH) en las dos copias → nivel H, máscara 3
- Estructura de bloques: 6 bloques, 26 codewords de ECC cada uno, 86 de datos
- **Síndromes Reed-Solomon en cero en los 6 bloques** → cero errores, los 30 % de
  redundancia quedan enteros como margen para el desgaste
- Payload decodificado: coincide exacto con la URL, 79 bytes

Falta el test físico (ver checklist abajo).

---

## La pieza: cartel de mostrador

**LISTO PARA IMPRENTA** desde el 2026-08-24. Ya no depende de nada del cliente.

A6 vertical, **100 × 150 mm + 3 mm de sangrado** por lado = 106 × 156 mm.
Archivo: `cartel-mostrador.html`.

**Exportar el PDF:** abrir en Chrome → Imprimir → Guardar como PDF → Márgenes
**Ninguno** → Tamaño personalizado 106 × 156 mm → **Gráficos de fondo activado**
(si no, los colores salen en blanco). Sale vectorial con las fuentes embebidas.

**Necesita internet al imprimir**: las tipografías (Anybody + Instrument Sans, las
mismas del sitio) vienen de Google Fonts. Sin conexión caen a Arial y el layout se
mueve — hay 7,6 mm de aire de sobra, así que no se rompe, pero no queda igual.

**Materiales:** cartulina 300 g **mate** o acrílico portafolio A6. Mate, no
brillante: el brillo refleja bajo luz de tubo y arruina el escaneo.

### Marca aplicada

- **Logo real** embebido en base64 (para que el archivo no dependa de ninguna
  carpeta cuando se lo mande a la imprenta), a 27 mm de ancho = **470 dpi**.
  Se le recortó la transparencia sobrante del PNG original (era 500×500 con el
  dibujo de 500×415).
- Tipografías **Anybody** (titular) + **Instrument Sans** (texto), las mismas del sitio.
- Franja superior azul / amarillo / rojo en la proporción 2:1:1 del sitio.
- Fondo en blanco cálido `#FDFBF7`, como manda el manual — no blanco puro.

### Medidas verificadas en el navegador

| | |
|---|---|
| Pieza con sangrado | 106 × 156 mm |
| QR | 40 mm (0,70 mm por módulo) |
| Logo | 27 × 22,4 mm |
| Aire libre restante | 7,6 mm |
| Pie al borde de corte | 4 mm |

### Copy

> **¿TE ATENDIMOS BIEN?**
> Contanos tu experiencia en **Google**.
> Nos ayuda a que más vecinos nos encuentren.
>
> [ QR 40 mm ]
>
> **ESCANEÁ CON LA CÁMARA DEL CELULAR**
> Son 20 segundos. No hace falta ninguna app.
>
> Bv. José Batlle y Ordóñez 1738 · Buceo — 2613 0815

### Reglas del copy — no negociables

- **No ofrecer descuentos ni regalos a cambio de reseñas.** Viola las políticas de
  Google y puede terminar con las reseñas borradas o la ficha penalizada. Las 250
  que ya tienen valen demasiado como para arriesgarlas.
- Pedir "contanos tu experiencia", **nunca** "dejanos 5 estrellas". Pedir una
  calificación específica también es gating.
- Nada de "si tuviste un problema escribinos por privado en vez de reseñar": eso es
  review gating explícito y Google lo penaliza.

## Guion para el mostrador

El cartel solo no convierte. Lo que mueve la aguja es que el empleado lo pida en voz alta.

> "¿Te puedo pedir un favor? Si te fue bien, escaneá el QR y dejanos una opinión en Google.
> Nos ayuda un montón."

- Se pide **al final**, con la bolsa ya en la mano, cuando el cliente ya está conforme. Nunca al entrar.
- Se pide **girando el cartel hacia el cliente** con la mano. Ese gesto es la mitad del resultado.
- Un empleado que lo pide en serio rinde más que diez carteles.
- Se puede incentivar **al equipo** (interno). Al cliente no.

---

## Medición

Sin página intermedia no hay conteo de escaneos. Es el precio de que la pieza no dependa de
nada nuestro y dure años.

**Baseline 2026-08-24: 250 reseñas · 4,6 ★**

Competencia en Google (el volumen de reseñas pesa en el ranking del local pack):

| Comercio | Rating | Reseñas |
|---|---|---|
| Pintelux | 4,6 | 1.232 |
| Pintemax | 4,5 | 795 |
| **Propios** | **4,6** | **250** |
| Ebe Pinturas | 4,5 | 116 |
| PuntoColor | 4,7 | 56 |

Propios califica como los mejores pero tiene 5× menos volumen que Pintelux. Ese es el gap
que ataca esta pieza.

Registrar el conteo **semanal** en `metrics-log.md` (se lee de la ficha pública, no hace
falta acceso). Meta realista con cartel + guion: **+15 a +25 reseñas/mes**.

Vigilar que el rating no baje: si empiezan a entrar 3★, es una señal operativa real, no un
problema del cartel.

---

## Checklist de rollout

- [ ] Conseguir el logo en vector y reemplazar el placeholder
- [ ] Confirmar la paleta contra el logo original
- [ ] Confirmar si son uno o dos locales (dos directorios listan 1738 y 1694 — si son dos
      locales son dos fichas y dos QR distintos)
- [ ] Imprimir una prueba casera en papel común
- [ ] Escanear con Android reciente, iPhone reciente y un celular de gama baja
- [ ] Verificar que abre el **formulario de reseña**, no la ficha del negocio
- [ ] Probar desde 40-50 cm, bajo luz de tubo, en ángulo de ~30°
- [ ] Dejar la prueba en el local una semana y ver si los empleados efectivamente la usan
- [ ] Recién ahí, imprimir el lote final
- [ ] Reclamar la ficha de Google (ver más abajo — va en paralelo)

---

## Aparte: la ficha está sin reclamar

Al 2026-08-24 Google Maps muestra "Reclamar esta empresa" y "Agregar sitio web": la ficha
existe y acumuló 250 reseñas sola, pero **no la controla nadie**.

El QR funciona igual sobre una ficha sin reclamar. Pero mientras siga así:

- No se pueden **responder** reseñas (responder sube conversión y es señal de ranking)
- No hay insights (búsquedas, llamadas, pedidos de ruta)
- Cualquiera puede sugerir ediciones y Google las aplica
- No hay web, horarios oficiales, fotos controladas ni productos
- La categoría dice solo "pinturería", cuando el Instagram declara
  **pinturas + electricidad + sanitaria** — se está perdiendo tráfico de dos rubros enteros

Reclamar es el paso de mayor retorno de todo este proyecto y no cuesta nada.

---

## NFC (opcional, no producido aún)

Se suma al mismo cartel sin rediseñar nada: el tag se pega detrás, en la zona del QR.

- **Tag:** NTAG213 (144 bytes, sobra para esta URL), sticker de 25-30 mm
- **Sobre metal** (caja, POS): sí o sí tags "on-metal", los comunes no funcionan
- **Grabado:** app NFC Tools → Write → URL/URI → pegar la URL → Write → **Lock** (bloqueo
  permanente para que nadie lo reescriba)
- **Compatibilidad:** Android casi todos. iPhone lee sin abrir app desde el XS, con pantalla
  encendida y desbloqueada; iPhone 7/8/X necesitan abrir una app
- Por eso el QR hace el trabajo y el NFC es el extra, nunca al revés
- Si se suma NFC, el copy pasa a "Escaneá o acercá el celular"
