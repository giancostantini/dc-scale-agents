# Brandbook Processor — Guía operativa

> Agente que transforma el texto crudo del brandbook de un cliente en 8 archivos estructurados que alimentan a los agentes de marketing IA.

## Qué hace

Cuando un cliente nuevo se carga al sistema (o cuando se actualiza el brandbook de un cliente existente), este agente:

1. Recibe el texto del brandbook (extraído de un PDF, una presentación, o pegado a mano).
2. Llama a Claude con un prompt estructurado que pide dividir el contenido en 8 secciones.
3. Escribe los 8 archivos resultantes en `vault/clients/<slug>/brand/`.
4. Si ya había una versión previa, la archiva en `brand/_archive/<YYYY-MM-DD-HHmm>/` antes de sobrescribir.
5. Notifica al dashboard cuando termina.

Los 8 archivos generados son:

| Archivo | Contenido |
|---|---|
| `positioning.md` | Statement, target, misión, visión, valores, slogan |
| `voice-operational.md` | Voz de la marca cuando comunica como plataforma. 4 atributos típicos con ejemplos ✅/❌ |
| `voice-character.md` | Si hay personaje/mascot (e.g. WIZZO en WizTrip) — atributos, diccionario propio, ejemplos ✅/❌ |
| `voice-decision.md` | Tabla de decisión: cuándo usar voz operativa vs personaje |
| `visual-identity.md` | Logo, paleta hex, tipografías, reglas de uso, usos incorrectos |
| `photography.md` | Tipología de imagen, look & feel, qué SÍ y qué NO mostrar |
| `content-formats.md` | Tipos de pieza con estructura (logo, foto, texto, CTA por formato) |
| `restrictions.md` | Guard rails consolidados — qué NUNCA hacer en voz, copy, visual, contenido |

## Cómo cargar un brandbook (cliente nuevo)

### Opción A — Desde el wizard de cliente nuevo (recomendado)

1. Dashboard → **Nuevo cliente** → completá pasos 1-3 (servicio, datos, contrato).
2. Paso 4 — **Kickoff + Branding**:
   - Subí el documento de Kickoff (PDF/DOCX).
   - Subí los assets visuales del branding (logos, paleta exportada, fonts, mockups — hasta 50 MB cada uno).
   - **En el bloque "Brandbook"**:
     - **Si tu brandbook es PDF y pesa &lt;100 MB**: arrastralo al input "Subir PDF (extracción automática)". El browser extrae el texto en unos segundos y autocompleta el textarea. Revisá el resultado.
     - **Si pesa &gt;100 MB** (típico de brandbooks con muchas imágenes hi-res): abrilo en ChatGPT, Claude.ai, o Gemini, pedí *"extraé todo el contenido textual relevante para alimentar agentes de marketing IA en formato Markdown"*, y pegá el resultado en el textarea.
     - **Link al PDF master (opcional)**: si el cliente tiene el PDF original en Drive/Dropbox, pegá el link. Los agentes no lo leen — es referencia humana.
3. Completá el resto del wizard y dale **"Crear cliente"**.
4. **30-60 segundos después** los 8 archivos están en `vault/clients/<slug>/brand/`.
5. Notification toast en el dashboard: *"Brandbook listo para &lt;Cliente&gt;"*.
6. Verificá entrando a **`/cliente/<slug>/brandbook`** — vas a ver los 8 archivos rendereados como Markdown editable.

### Opción B — Re-procesar un brandbook existente

Si el cliente ya existe y querés actualizar su brandbook:

1. Dashboard → cliente → sidebar **Brandbook**.
2. Click **↻ Re-procesar brandbook** arriba a la derecha.
3. Pegá el texto nuevo (o subí PDF para extracción auto).
4. Submit.
5. La versión anterior se archiva automáticamente en `brand/_archive/<timestamp>/` con un `source.md` que guarda el texto original.

### Opción C — CLI (para debugging)

```bash
# brief.json:
# {
#   "client": "wiztrip",
#   "brandbookText": "...texto completo del brandbook...",
#   "brandbookUrl": "https://drive.google.com/...",  // opcional
#   "source": "cli"
# }

node scripts/brandbook-processor/index.js --brief /tmp/brief.json
```

## Cómo ajustar un archivo del brand/ manualmente

Si el processor generó algún archivo que no es 100% lo que querés:

1. Dashboard → cliente → **Brandbook**.
2. Encontrás los 8 archivos como secciones colapsables con render Markdown.
3. Click **Editar** en la sección a ajustar.
4. Modal con el texto en formato Markdown.
5. Editá → **Guardar**.
6. El archivo se sobrescribe en main (commit automático), cache invalidada, **los agentes empiezan a usar la versión nueva en menos de 5 minutos**.

## Cómo se nutren los agentes

Cada agente declara qué archivos del `brand/` necesita en su `loadContext()`:

| Agente | Lee del brand/ |
|---|---|
| **Consultor** (in-process en Vercel) | TODOS — es el punto de contacto humano |
| **Content Creator** | TODOS — genera piezas con tono + visual + restricciones |
| **Content Strategy** | positioning + voice-decision + content-formats |
| **Social Media Metrics** | voice-operational + voice-character + content-formats |
| **SEO** | positioning + voice-operational + restrictions |
| **Morning Briefing** | positioning |
| **Reporting Performance** | positioning |
| **Stock + Logistics** | nada (no necesitan brand) |

### Para agentes que corren en GHA (el repo está checkout-eado)

Usan `scripts/lib/brand-loader.js`:

```js
import { loadBrandFiles, buildBrandBlock } from "../lib/brand-loader.js";

const brand = loadBrandFiles(VAULT, client, [
  "positioning",
  "voice-decision",
  "content-formats",
]); // o "*" para todos
const brandBlock = buildBrandBlock(brand);

// Después se inyecta en el prompt como bloque ## brand/<filename>
```

### Para agentes que corren in-process en Vercel (Consultor, fast-path)

Usan `dashboard/lib/vault-loader.ts`:

```ts
import { loadClientVaultContext, buildVaultBlock } from "@/lib/vault-loader";

const vault = await loadClientVaultContext(clientId);
const block = buildVaultBlock(vault); // incluye brand/ automáticamente
```

El `vault-loader` fetcha los archivos via GitHub Contents API (raw), cachea 5 min, y filtra automáticamente `_archive/`.

## Qué NO hace el processor

- **No modifica `claude-client.md`** — ese archivo es overview operativo (sector, fee, contact, KPIs target). El brand/ es brandbook estructurado, separado.
- **No genera assets visuales** — los logos, paleta exportada, fonts y mockups se suben separados al wizard como "Assets de branding" (Supabase Storage).
- **No traduce** — el texto del brandbook se procesa en el idioma original. Si un brandbook viene en inglés, los archivos quedan en inglés (los agentes igual los entienden).
- **No valida la calidad del brandbook** — si el texto es pobre, los archivos generados van a ser pobres. Garbage in, garbage out.

## Errores comunes

### "brandbookText too short (X chars). Mínimo 200"
El texto que pegaste es muy corto. Revisá que copiaste el brandbook completo, no solo la portada.

### "Claude output no es JSON válido"
Claude devolvió algo que no es JSON parseable. Suele pasar cuando el brandbook tiene caracteres muy raros o cuando el prompt se cortó. Re-intentá.

### "GitHub dispatch failed"
El token `GH_DISPATCH_TOKEN` en Vercel no tiene permisos suficientes. Necesita `Contents: write` y `Metadata: read`.

### El processor terminó pero algunos archivos están vacíos
El brandbook no tenía esa sección. Por ejemplo, si el cliente no tiene un personaje/mascot, `voice-character.md` queda como placeholder explícito ("Este cliente no tiene un personaje definido — usar siempre la voz operativa"). Eso está bien, no es un error.

## Versionado

Cada vez que se re-procesa, los archivos viejos se mueven a:

```
vault/clients/<slug>/brand/_archive/<YYYY-MM-DD-HHmm>/
├── positioning.md
├── voice-operational.md
├── ...
└── source.md           # texto del brandbook que generó esa versión
```

El dashboard muestra estos archives en `/cliente/<slug>/brandbook` (sección colapsable al pie). Para restaurar una versión:

1. Click "Ver source original" en el archive.
2. Copiá el texto entre los \`\`\` del `source.md`.
3. **Re-procesar brandbook** → pegá el texto → submit.

## Workflow técnico

```
Dashboard wizard
    ↓ POST /api/clients/bootstrap (con brandbookText)
Vercel API
    ↓ insert agent_runs (status: running)
    ↓ dispatch repository_dispatch
GitHub Actions
    ↓ scripts/brandbook-processor/index.js
    ↓ archive previous version (if exists)
    ↓ Claude API → 8 sections JSON
    ↓ writeFileSync × 8
    ↓ commit + push
    ↓ updateAgentRun (status: success)
    ↓ pushNotification
Dashboard (Realtime)
    ↓ bell muestra "Brandbook listo"
```

Costo aproximado por brandbook: ~$0.20-$0.40 USD (1 llamada Claude Sonnet con prompt de ~30 KB → output ~16 KB).
