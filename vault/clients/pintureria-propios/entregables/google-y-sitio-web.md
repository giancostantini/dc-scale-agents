# Ficha de Google + sitio web — Pinturería Propios

_Plan operativo · D&C Scale Partners · 2026-08-24_

Dos frentes que se refuerzan: la ficha de Google reclamada y optimizada, y un sitio propio
al que la ficha pueda apuntar. Van en paralelo.

---

## Situación al 2026-08-24

| | |
|---|---|
| Ficha de Google | Existe, **sin reclamar**. 250 reseñas, 4,6 ★ |
| Place ID | `ChIJ_VJqXSSBn5UR4XwZUpgyYm8` |
| Categoría en Google | Solo "pinturería" |
| Sitio web | `pintureriapropios.com.uy` **venció y se liberó** (NXDOMAIN) |
| `pintureriapropios.uy` | Libre |
| Instagram | [@pintureriapropios](https://www.instagram.com/pintureriapropios/) · 148 seguidores |

El dato más caro de todos: la ficha tiene **250 reseñas acumuladas sin que nadie la maneje**.
Es un activo que ya existe y que hoy no rinde.

---

## Frente 1 — Reclamar la ficha

### Cómo la estructuramos (importante)

**Dueño = el cliente. Nosotros = administradores.**

El dueño de Propios reclama y verifica con **su** cuenta de Google, y después nos agrega a
nosotros como administradores. Tenemos control total para trabajar y el activo queda donde
corresponde. Si algún día se corta la relación, no hay que pelear una transferencia con el
soporte de Google — que a veces la traba durante semanas.

Reclamarla nosotros sería más rápido de coordinar, pero pone una ficha con 250 reseñas del
cliente a nombre de la agencia. No conviene, ni para ellos ni para nosotros.

### Pasos

1. El dueño entra a **google.com/business** con la cuenta de Google que va a quedar como
   titular. Si no tiene una, que cree un Gmail **de la empresa**, no uno personal
   (ej. `pintureriapropios@gmail.com`). Esa cuenta va a ser la llave del activo para siempre.
2. Buscar "Pinturería Propios" → aparece la ficha existente → **"Reclamar esta empresa"**.
   Es clave reclamar **esta** ficha, no crear una nueva: crear una nueva duplica el negocio y
   las 250 reseñas quedan colgando de la vieja.
3. Google elige el método de verificación (no se puede elegir). Hoy en Uruguay lo más común
   es **video**: hay que grabar un recorrido continuo mostrando fachada con el cartel, el
   interior con mercadería, y algo que pruebe que sos vos quien maneja el negocio (una
   factura del local, el talonario, la caja). No se puede cortar el video.
4. Google revisa. Suele tardar de unos días a un par de semanas, y a veces rebota una vez.
   Si rebota, se vuelve a intentar cuidando que el cartel de la fachada se lea claro.
5. Verificada la ficha: **Configuración → Usuarios → Agregar** el mail de la agencia con rol
   **Administrador** (no Propietario).

### Qué necesito del cliente para esto

- Quién es el titular y con qué cuenta de Google va a quedar la ficha
- Que tenga a mano documentación del local para el video (factura, talonario, etc.)
- Que confirme que el cartel de la fachada se ve y se lee

### Apenas quede reclamada — la optimización que sí mueve la aguja

1. **Categorías.** Hoy dice solo "pinturería". El Instagram declara **pinturas, electricidad
   y sanitaria**: hay que agregar categorías secundarias (ferretería, tienda de artículos
   eléctricos, tienda de artículos sanitarios). Sin eso, Propios directamente **no aparece**
   cuando alguien busca "materiales eléctricos cerca" o "sanitaria en Buceo". Es tráfico de
   dos rubros enteros que hoy se está regalando.
2. **Sitio web** — el campo está vacío. Se completa cuando el sitio esté arriba (frente 2).
3. **Horarios reales**, incluidos feriados.
4. **Fotos.** Fachada, interior, mostrador, mercadería, equipo. Las fichas con fotos propias
   convierten bastante mejor que las que solo tienen fotos de usuarios.
5. **Descripción** de 750 caracteres con los tres rubros.
6. **Responder las reseñas.** Todas, incluso las viejas. Responder es señal de ranking y lo
   ve el que está decidiendo a qué pinturería ir. Empezar por las negativas, sin discutir.
7. **Productos y servicios**, si tienen tiempo de cargarlos.

---

## Frente 2 — Sitio web

### Qué se construyó

One-pager institucional en `sites/pintureria-propios/` del repo. Mismo patrón que `landing/`
y `kickoff/`: HTML + CSS vanilla, un solo archivo, sin build, deploy en Vercel.

Contenido: hero con los tres rubros, qué venden, por qué Propios, dónde están con mapa y
horarios, y un bloque que pide la opinión en Google (mismo link que el QR del mostrador).

Incluye **JSON-LD `HardwareStore`** con dirección, teléfono, horarios y el Place ID. Eso es lo
que le permite a Google atar el sitio con la ficha.

**No se incluyó `aggregateRating`** en el schema a propósito: Google penaliza el rating
autodeclarado en la propia web. La calificación tiene que venir de la ficha.

### Dominio

Registrar **`pintureriapropios.com.uy`**. Está libre y era el de ellos, así que sigue impreso
en material viejo y listado en directorios uruguayos (1122, Yelu, planetauruguay, ferreteriasuy).
Recuperarlo recicla esas menciones en vez de arrancar de cero.

Los `.com.uy` se gestionan a través del registro nacional (dominios.com.uy / Antel). Hay que
verificar el trámite y el costo vigentes al momento de registrar, y que quede a nombre del
cliente, no de la agencia — mismo criterio que la ficha de Google.

### Deploy

Proyecto nuevo de Vercel apuntando al repo, con **Root Directory = `sites/pintureria-propios`**.
Después se apunta el dominio desde el panel de Vercel.

### Pendientes bloqueantes antes de publicar

Están arriba de todo en `index.html`, en el bloque "DATOS A CONFIRMAR":

1. **Horarios.** Los que están salen de directorios de terceros, no del cliente. Aparecen en
   el sitio **y en el JSON-LD que lee Google**. Un horario mal publicado hace que alguien vaya
   y encuentre cerrado — es peor que no tener horarios.
2. **WhatsApp.** Los botones están comentados en el HTML (`WHATSAPP_PENDIENTE`). El 2613 0815
   es fijo; hace falta un celular 09x. Si no tienen WhatsApp comercial, se borran los botones.
3. **Logo en vector.** Hay un placeholder SVG hecho con la paleta. El logo real es un óvalo
   azul/amarillo/rojo con la mascota, y de él solo tenemos la versión de 150 px del perfil de
   Instagram — no sirve ni para el sitio ni para imprenta.
4. **Marcas que trabajan.** La sección existe comentada en el HTML, esperando la lista.
5. **Años de trayectoria.** Un directorio dice 22 años. Sin confirmar, no se publicó.
6. **¿Uno o dos locales?** Hay directorios que listan también el 1694 de la misma avenida. Si
   son dos locales, son **dos fichas de Google, dos QR y dos direcciones en el sitio**.

---

## Lo que necesito del cliente, en una sola lista

**Para el sitio y para el cartel:**
1. Logo en vector (`.ai`, `.eps`, `.svg` o `.pdf`). Si no existe, foto de buena calidad del
   cartel de la fachada y lo redibujamos.
2. Colores exactos de marca, si hay manual.
3. Horarios reales, incluido qué pasa en feriados.
4. Celular de WhatsApp comercial (o confirmar que no usan).
5. Marcas de pintura, electricidad y sanitaria que trabajan.
6. Años de trayectoria, si lo quieren comunicar.
7. Fotos del local: fachada, interior, mostrador, mercadería, equipo.
8. Confirmación de si son uno o dos locales.

**Para la ficha de Google:**
9. Quién es el titular y con qué cuenta de Google va a quedar.
10. Documentación del local a mano para el video de verificación.

**Para el dominio:**
11. Datos de la empresa para registrar el `.com.uy` a nombre de ellos.

---

## Orden sugerido

1. Cliente arranca el reclamo de la ficha (es lo que más tarda — se dispara y se espera).
2. En paralelo, registrar el dominio.
3. Cliente manda logo, horarios, WhatsApp, marcas y fotos.
4. Cerramos el sitio con los datos reales y lo deployamos.
5. Ficha verificada → cargar sitio, categorías secundarias, horarios, fotos, descripción.
6. Empezar a responder reseñas, arrancando por las negativas.
7. Cartel de mostrador impreso y guion al equipo (ver `qr-resenas-google.md`).
