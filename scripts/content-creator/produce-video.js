/**
 * Content Creator Agent — Remotion Video Producer (Fase 2)
 *
 * Called by index.js when brief.produceVideo === true
 * Flow:
 *   1. Receives storyboard text from Phase 1
 *   2. Calls Claude to generate Remotion React components
 *   3. Writes components to remotion-studio/src/compositions/
 *   4. Registers the composition in Root.tsx
 *   5. Runs `npx remotion render` to produce the MP4
 *   6. Returns the output video path
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { execSync } from "child_process";
import { createRequire } from "module";
import { syncClientAssets, buildAssetMapBlock } from "../lib/asset-sync.js";
import { loadBrandFiles } from "../lib/brand-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = resolve(__dirname, "../../remotion-studio");
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Strip ANSI escape sequences (color/SGR codes) del stderr/stdout antes de
// guardarlo en JSON o mostrarlo en la UI. Cubre CSI (ESC [...letter) y OSC
// (ESC ] ... BEL/ST). Helper inline; si lo necesitamos en otro agente lo
// movemos a scripts/lib/ansi.js.
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\))/g;
function stripAnsi(s) {
  if (!s) return "";
  return String(s).replace(ANSI_REGEX, "");
}

/**
 * Pelamos markdown fences que Claude a veces emite a pesar del prompt
 * "Output ONLY a single TypeScript/TSX file. No explanations, no markdown
 * fences." Cubrimos los casos:
 *   ```tsx\n<código>\n```
 *   ```typescript\n<código>\n```
 *   ```\n<código>\n```
 *   "Acá tenés el componente:\n```tsx\n<código>\n```"  (con preámbulo)
 *
 * Si el TSX no viene con fences, devolvemos tal cual (trim solo).
 * Si vienen MÚLTIPLES bloques de código, agarramos el más largo (que es
 * el componente principal — los otros suelen ser snippets de explicación).
 */
function sanitizeRemotionCode(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();

  // Paso 1: pelar markdown fences si los hay.
  const fenceRegex = /```(?:tsx|typescript|ts|jsx|js)?\s*\n([\s\S]*?)\n```/gi;
  const blocks = [];
  let match;
  while ((match = fenceRegex.exec(trimmed)) !== null) {
    blocks.push(match[1]);
  }
  let body;
  if (blocks.length > 0) {
    blocks.sort((a, b) => b.length - a.length);
    body = blocks[0].trim();
  } else if (trimmed.startsWith("```")) {
    // Fence abierto sin cerrar (caso degenerado).
    const firstNl = trimmed.indexOf("\n");
    let inner = firstNl >= 0 ? trimmed.slice(firstNl + 1) : trimmed;
    if (inner.endsWith("```")) inner = inner.slice(0, -3);
    body = inner.trim();
  } else {
    body = trimmed;
  }

  // Paso 2: revertir markdown autolinks que Claude a veces emite dentro del
  // código JS/TSX. Patrón: `[<expression>](http(s)://<expression>)` o el
  // mismo expression en ambos lados — un autolink de markdown que se
  // contaminó. Ejemplos reales de output de Claude:
  //   color: [C.gold](http://C.gold),
  //   [items.map](http://items.map)((item) => ...)
  //   border: `2px solid ${[C.gold](http://C.gold)}`
  // esbuild los lee como array literal seguido de llamada de función →
  // "Expected ';' but found '{'". Los reemplazamos por la expresión cruda.
  // Captura: corchete abre, expresión idem (letras/números/punto/_$/[ ]),
  // corchete cierra, paréntesis con http(s):// y la misma expresión adentro.
  const autolinkRegex =
    /\[([A-Za-z_$][\w$.\[\]]*)\]\(https?:\/\/[^\s)]+\)/g;
  body = body.replace(autolinkRegex, "$1");

  return body;
}

/**
 * Validación mínima del TSX antes de pasarlo al bundler. Si Claude devolvió
 * texto narrativo, JSON, o un fragmento que no parece un módulo TS válido,
 * fallamos rápido con un error accionable en vez de esperar que esbuild
 * explote en setup-cache.js con un mensaje opaco.
 */
function validateRemotionCode(code, compositionId) {
  if (!code || code.length < 100) {
    throw new Error(
      `Composition TSX vacía o demasiado corta (${code?.length ?? 0} chars). ` +
      `Claude probablemente devolvió texto narrativo en vez de código.`,
    );
  }
  const hasImport = /\bimport\b/.test(code);
  const hasExport = /\bexport\b/.test(code);
  if (!hasImport || !hasExport) {
    throw new Error(
      `Composition TSX no parece módulo válido (import: ${hasImport}, export: ${hasExport}). ` +
      `Primeros 200 chars: ${code.slice(0, 200)}`,
    );
  }
  if (!code.includes(compositionId)) {
    throw new Error(
      `Composition TSX no exporta el component "${compositionId}". ` +
      `Esperábamos un export default o nombrado con ese ID. Claude devolvió ` +
      `un componente con otro nombre o estructura. Primeros 300 chars: ${code.slice(0, 300)}`,
    );
  }
}

/**
 * Strips de comentarios y string literals antes de contar tags/braces. Un
 * comentario JSX `{/* missing </div> *\/}` o un string `"<div>"` puede
 * inflar artificialmente el count y darnos un falso "balanced". Quitamos:
 *   - `// line comment`
 *   - `/* block comment *\/`
 *   - `{/* JSX comment *\/}`
 *   - strings con comillas dobles, simples, y backticks
 *
 * Es heurístico (no un parser TS real) pero alcanza para los outputs de Claude
 * que son código bien formado salvo por el bug que estamos cazando.
 */
function stripCommentsAndStrings(code) {
  let out = code;
  // 1. JSX comments: {/* ... */}
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  // 2. Block comments: /* ... */
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  // 3. Line comments: // ...
  out = out.replace(/\/\/[^\n]*/g, "");
  // 4. Template literals: `...` (incluyendo escaped)
  out = out.replace(/`(?:[^`\\]|\\.)*`/g, "``");
  // 5. Strings con comillas dobles
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  // 6. Strings con comillas simples
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  return out;
}

/**
 * Valida balance de tags JSX + cierres de braces + último char. Si Claude
 * cortó la generación a mitad de un componente (max_tokens) suele dejar:
 *   1. Último caracter abrupto (no es `}`, `;`, `>`, `)`, `]` ni `/`).
 *   2. Braces `{` `}` desbalanceados.
 *   3. Tags JSX abiertos sin cerrar.
 *
 * Las 3 son señales válidas e independientes — corremos las 3 porque algunos
 * truncamientos solo se ven en uno de los tres y no en los otros. Si alguna
 * falla, throw error que el retry loop captura para pedir regeneración.
 *
 * Antes de contar, strippeamos comentarios y strings: un `{/* </div> *\/}`
 * o un `"<div>"` no debe contar.
 */
function validateJsxBalance(code) {
  const trimmed = (code || "").trim();
  if (!trimmed) {
    throw new Error("TSX vacío — Claude no devolvió código");
  }

  const cleaned = stripCommentsAndStrings(trimmed);

  // 1. Último caracter útil debe cerrar algo. Cierres válidos: } ; ) > ] /.
  const lastChar = trimmed[trimmed.length - 1];
  if (!"};)>]/".includes(lastChar)) {
    const tail = trimmed.slice(-200);
    throw new Error(
      `TSX termina abrupto con "${lastChar}" — probable truncamiento por max_tokens. ` +
      `Últimos 200 chars: ${JSON.stringify(tail)}`,
    );
  }

  // 2. Braces { y } balanceados (típico de objetos / cuerpos de funciones
  //    cortados a mitad).
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    throw new Error(
      `Braces desbalanceadas (${openBraces} abren vs ${closeBraces} cierran). ` +
      `Diferencia: ${openBraces - closeBraces}. Probable truncamiento por max_tokens.`,
    );
  }

  // 3. Tags JSX balanceados. Self-closing (<Img />, <Audio />) excluidos.
  const balancedTags = [
    "div",
    "span",
    "AbsoluteFill",
    "Sequence",
    "SafeZone",
    "ColorScene",
    "ImageScene",
    "TextOverlay",
    "FadeTransition",
    "FlashTransition",
  ];

  const issues = [];
  for (const tag of balancedTags) {
    const openRegex = new RegExp(`<${tag}(?:\\s[^>]*)?(?<!/)>`, "g");
    const closeRegex = new RegExp(`</${tag}\\s*>`, "g");
    const opens = (cleaned.match(openRegex) || []).length;
    const closes = (cleaned.match(closeRegex) || []).length;
    if (opens !== closes) {
      issues.push(`<${tag}>: ${opens} aperturas vs ${closes} cierres`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Tags JSX desbalanceados — Claude probablemente cortó el output a mitad de un componente:\n` +
      issues.map((i) => `  - ${i}`).join("\n") +
      `\nEsto suele pasar cuando max_tokens se alcanza durante la generación. ` +
      `El retry va a pedirle a Claude que cierre todos los tags.`,
    );
  }
}

/**
 * Prompt de retry: le mostramos a Claude el código que devolvió + el error
 * exacto y le pedimos una versión corregida. Mucho más corto que el prompt
 * inicial — solo lleva contexto suficiente para arreglar el bug.
 */
function buildRetryPrompt(previousCode, errorMessage, compositionId) {
  return `You previously generated this Remotion composition for ID "${compositionId}":

\`\`\`tsx
${previousCode}
\`\`\`

But it FAILED with this error:

${errorMessage}

YOUR TASK: Generate a COMPLETE, CORRECTED version of the same component that fixes this specific error.

CRITICAL REQUIREMENTS:
1. Output ONLY the corrected TSX file. No explanations, no markdown fences, no preamble.
2. The file must be a complete, self-contained TypeScript/React module.
3. Every opening JSX tag MUST have a matching closing tag — count them mentally before finishing:
   - Every <div> needs </div>
   - Every <AbsoluteFill> needs </AbsoluteFill>
   - Every <Sequence> needs </Sequence>
   - Every <SafeZone> needs </SafeZone>
   - Self-closing tags like <Img />, <Audio /> are fine as-is.
4. Keep the same structure, scenes, animations, and visual identity as the original — only fix the bug.
5. Export default ${compositionId} and export const COMPOSITION_CONFIG.
6. Do NOT shorten the composition to "fit" — finish all sequences. Quality matters.
7. Verify the TSX is syntactically valid before responding.

Output the corrected component now:`;
}

/**
 * Intenta parsear el TSX con esbuild para detectar errores de sintaxis ANTES
 * de invocar `npx remotion render`. esbuild viene como transitive dep de
 * @remotion/bundler — usamos un import dinámico para no agregar dep nueva
 * y para que el agente siga funcionando si en algún ambiente raro no está.
 *
 * Retorna null si el TSX parsea limpio, o un string con el error formateado
 * (incluye línea:columna y un fragmento del código alrededor del error).
 */
async function tryParseTsx(code, file) {
  let esbuild;
  try {
    // Resolver esbuild desde remotion-studio explícitamente (es transitive dep
    // de @remotion/bundler). Sin esto, `import("esbuild")` busca en el ancestor
    // chain de scripts/content-creator/, donde no hay node_modules — falla
    // silenciosamente y la pre-validación se saltea. createRequire desde el
    // package.json de remotion-studio usa el resolver oficial de Node desde
    // SU node_modules tree.
    const requireFromStudio = createRequire(
      pathToFileURL(resolve(REMOTION_DIR, "package.json")).href,
    );
    const esbuildPath = requireFromStudio.resolve("esbuild");
    esbuild = await import(pathToFileURL(esbuildPath).href);
  } catch (resolveErr) {
    console.warn(
      `[produce-video] esbuild no resoluble desde remotion-studio ` +
      `(${resolveErr.code || resolveErr.message}) — saltamos pre-validación`,
    );
    return null;
  }
  try {
    await esbuild.transform(code, {
      loader: "tsx",
      sourcefile: file,
    });
    return null;
  } catch (err) {
    // err.errors es un array de { text, location: { line, column, lineText, file } }
    const errors = Array.isArray(err.errors) ? err.errors : [];
    if (errors.length === 0) return err.message || String(err);
    const formatted = errors
      .slice(0, 3)
      .map((e) => {
        const loc = e.location;
        if (!loc) return e.text;
        const fileLine = loc.file
          ? `${loc.file.split(/[\\/]/).pop()}:${loc.line}:${loc.column}`
          : `:${loc.line}:${loc.column}`;
        return `${fileLine}: ${e.text}\n  ${loc.lineText || ""}`;
      })
      .join("\n\n");
    return formatted;
  }
}

async function callClaude(prompt, maxTokens = 32000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// --- Remotion code generation prompt ---

function buildVisualIdentitySnippet(client) {
  // Lee visual-identity.md y restrictions.md del brand/ del cliente para
  // inyectar la identidad visual REAL en el prompt de Remotion. Esto reemplaza
  // los hardcodes anteriores ("artisanal" + paleta marrón random).
  const brand = loadBrandFiles(VAULT, client, [
    "visual-identity",
    "restrictions",
    "voice-decision",
  ]);
  const parts = [];
  if (brand["visual-identity"]) {
    parts.push("--- IDENTIDAD VISUAL DEL CLIENTE (extraído del brandbook) ---");
    parts.push(brand["visual-identity"]);
  }
  if (brand["restrictions"]) {
    parts.push("");
    parts.push("--- RESTRICCIONES VISUALES (qué NUNCA hacer) ---");
    parts.push(brand["restrictions"]);
  }
  return parts.length > 0
    ? parts.join("\n")
    : `--- IDENTIDAD VISUAL ---\n(Cliente sin brand/visual-identity.md cargado — usar paleta y fonts genéricas modernas)`;
}

function buildRemotionPrompt(storyboard, brief, compositionId, assetBlock) {
  const voicePath = brief._voicePath || null;
  const visualIdentity = buildVisualIdentitySnippet(brief.client);

  return `You are an expert Remotion (React video framework) developer.

Generate a complete, production-ready Remotion composition based on this storyboard.

JS IDENTIFIER: ${compositionId}  ← Use this verbatim WITH UNDERSCORES for the JS export, import, and component name (\`export const ${compositionId}\`, \`<MyScene component={${compositionId}}>\`, etc.). JS doesn't allow hyphens in identifiers. The string value of COMPOSITION_CONFIG.id can be anything — we ignore it; the real Remotion id is set elsewhere.
CLIENT: ${brief.client}
ASPECT RATIO: 9:16 (1080x1920 — vertical video for Instagram Reels / TikTok)
FPS: 30
SAFE ZONE: No text/important elements in top 150px or bottom 250px (platform UI)

${visualIdentity}

--- STORYBOARD ---
${storyboard}

${assetBlock}

--- AVAILABLE REMOTION TEMPLATES ---
Import from these paths (they are already created):
- "../templates/TextOverlay" → TextOverlay component
  Props: text, fontSize, fontWeight, color, top, bottom, left, right, align, animation ("fade-in"|"slide-up"|"scale-in"|"none"), delay, backgroundColor, padding, maxWidth, fontFamily (string)

- "../templates/ImageScene" → ImageScene component
  Props: src, objectFit, animation ("zoom-in"|"zoom-out"|"pan-right"|"pan-left"|"none"), overlayColor, overlayOpacity, brightness

- "../templates/ColorScene" → ColorScene component
  Props: color, gradient ({from, to, direction}), children

- "../templates/Transition" → FadeTransition, FlashTransition components
  Props: children, durationInFrames

- "../templates/SafeZone" → SafeZone component (wraps content within safe area)
  Props: children, showGuides

From remotion, use: AbsoluteFill, Sequence, useCurrentFrame, interpolate, Audio, Video, Img, staticFile, spring

--- AUDIO ---
${voicePath
  ? `Voice narration audio is available at: "${voicePath}"
Include it using: <Audio src="${voicePath}" /> inside the main composition (outside any Sequence).
The audio track runs for the full duration of the video.`
  : "No voice audio available. Use only music/SFX if needed (reference Pixabay royalty-free)."}

--- FONTS DEL BRANDBOOK ---

Hay 2 caminos para cargar las fonts del cliente, en este orden de preferencia:

**Opción 1 — Fonts custom locales (PREFERIDA si el cliente entregó .otf/.ttf)**:
Si en ASSETS DISPONIBLES arriba ves archivos bajo \`tipografias/<font-family-slug>/\`, esas son las fonts oficiales del cliente entregadas por el diseñador. Cargalas en la composición usando \`@font-face\` en el head del documento HTML:

  import { staticFile } from "remotion";

  // Al inicio del componente, antes de los frames:
  const fontStyle = \`
    @font-face {
      font-family: 'BricolageGrotesque';
      src: url('\${staticFile("assets/<clientId>/tipografias/bricolage-grotesque/Bricolage_Grotesque-Bold.ttf")}') format('truetype');
      font-weight: bold;
      font-style: normal;
    }
    @font-face {
      font-family: 'HostGrotesk';
      src: url('\${staticFile("assets/<clientId>/tipografias/host-grotesk/HostGrotesk-Regular.ttf")}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
  \`;

  // En el JSX:
  <AbsoluteFill>
    <style>{fontStyle}</style>
    {/* ...frames... */}
  </AbsoluteFill>

Después usá \`fontFamily: 'BricolageGrotesque'\` o \`'HostGrotesk'\` en el style de cada \`<TextOverlay>\`.

**Opción 2 — @remotion/google-fonts (FALLBACK si no hay fonts custom)**:
Si NO hay archivos en \`tipografias/\` arriba o son insuficientes, usá Google Fonts:

  import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
  import { loadFont as loadHostGrotesk } from "@remotion/google-fonts/HostGrotesk";
  const { fontFamily: bricolage } = loadBricolage();
  const { fontFamily: hostGrotesk } = loadHostGrotesk();

Convención del brandbook (revisar visual-identity.md arriba):
- **Bricolage Grotesque (bold)** → Títulos / hooks / "EL PIQUE DE WIZZO"
- **Host Grotesk** → Texto corrido, subtítulos, CTAs largos
- **Noto Nastaliq Urdu** (o equivalente serif editorial) → Detalles, ledes, taglines

Decidí qué camino usar inspeccionando ASSETS DISPONIBLES arriba.

--- RULES ---
1. All text MUST be rendered using the <TextOverlay> component wrapped in <SafeZone>. NEVER write \`<div style={{ ... }}>...text...</div>\` blocks for text — the templates already handle animation, font stack, safe zone, and shadows. Reimplementing them with <div> inflates the file by 3-4x and risks max_tokens truncation.
2. Background images use <ImageScene> OUTSIDE SafeZone (full bleed). Background colors use <ColorScene>.
3. Use ONLY hex codes from the IDENTIDAD VISUAL section above. Don't invent palette.
4. First 3 seconds (frames 0-90): 3-5 distinct visual states for pattern interruption — staggered <TextOverlay> entrances with different "delay" props + scale/color shifts. Use the built-in animation prop (\"scale-in\" / \"slide-up\" / \"fade-in\") instead of writing custom spring()/interpolate() per scene.
5. Text hook must appear within first 30 frames (1 second).
6. Each scene transition should use either hard cut, FadeTransition, or FlashTransition.
7. If no image assets available for a frame, use ColorScene with brand gradient using palette hex.
8. Cuando referencies un asset del library (logos, mascot, patterns), usá EXACTAMENTE el publicPath listado en ASSETS DISPONIBLES arriba con \`staticFile(...)\`. NO inventes paths.
9. Si el storyboard menciona un asset que NO está en ASSETS DISPONIBLES, sustituílo por un placeholder visual razonable (ColorScene + texto descriptivo) y agregá un comentario \`// TODO MISSING ASSET: <descripción>\` en el código.
10. Font sizes: títulos hook 64-80px, subtítulos 36-48px, cuerpo 24-32px (escalas del brandbook).
11. **Target duration**: 900 frames (30 seconds) at 30fps. Maximum allowed: 1200 frames (40s). Do NOT generate longer compositions — vertical reels over 40s burn render time and audience attention.
12. **Scene count**: 4-5 scenes maximum. Each scene = one <Sequence>. More scenes ≠ better video; usually means copy-paste filler.
13. **DRY (CRITICAL)**: define ONE reusable internal Scene component parametrized by props (e.g. {bgColor, headline, subhead, assetSrc, animation}) and call it multiple times with different props. Do NOT generate Scene1, Scene2, ... Scene6 as separate functions with copy-pasted bodies — that pattern produces 700+ lines of dead weight, maxes out the token budget, and is what caused previous renders to fail. Target file size: under 500 lines.
14. **Animations**: prefer the built-in \`animation\` prop on <TextOverlay> / <ImageScene> over custom spring() / interpolate() calls per scene. Custom interpolate is fine for ONE special transition, not for routine entrances.

--- OUTPUT FORMAT ---
Output ONLY a single TypeScript/TSX file. No explanations, no markdown fences, no code blocks.

CRITICAL — never emit markdown syntax inside the code body:
- DO NOT write \`[C.gold](http://C.gold)\` — write \`C.gold\`.
- DO NOT write \`[items.map](http://items.map)((item) => ...)\` — write \`items.map((item) => ...)\`.
- DO NOT autolink any identifier or expression. The output is JS/TSX, not markdown.
- The pattern \`[<expr>](http(s)://...)\` is ALWAYS a bug in code output.

The file must:
- Be a valid React/Remotion component
- Export a default component named ${compositionId}
- Export a const COMPOSITION_CONFIG with: { id, width: 1080, height: 1920, fps: 30, durationInFrames }
- Use only the templates listed above + Remotion core imports + @remotion/google-fonts imports

Example structure (DRY pattern — follow this shape, do NOT make Scene1...Scene6):

import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile } from "remotion";
import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadHostGrotesk } from "@remotion/google-fonts/HostGrotesk";
import { TextOverlay } from "../../templates/TextOverlay";
import { ImageScene } from "../../templates/ImageScene";
import { ColorScene } from "../../templates/ColorScene";
import { SafeZone } from "../../templates/SafeZone";
import { FadeTransition } from "../../templates/Transition";

const { fontFamily: bricolage } = loadBricolage();
const { fontFamily: hostGrotesk } = loadHostGrotesk();

const C = { bg: "#0E0E0E", accent: "#E2B33A", text: "#FFFFFF" };

export const COMPOSITION_CONFIG = {
  id: "${compositionId}",
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 900, // 30 seconds — see RULE 11
};

interface SceneProps {
  headline: string;
  subhead?: string;
  assetSrc?: string;
  bgColor?: string;
}
const Scene: React.FC<SceneProps> = ({ headline, subhead, assetSrc, bgColor }) => (
  <AbsoluteFill style={{ backgroundColor: bgColor ?? C.bg }}>
    {assetSrc && (
      <ImageScene src={assetSrc} animation="zoom-in" overlayColor={C.bg} overlayOpacity={0.3} />
    )}
    <SafeZone>
      <TextOverlay
        text={headline}
        fontSize={72}
        color={C.accent}
        animation="slide-up"
        fontFamily={bricolage}
        top="35%"
      />
      {subhead && (
        <TextOverlay
          text={subhead}
          fontSize={32}
          color={C.text}
          animation="fade-in"
          delay={15}
          fontFamily={hostGrotesk}
          top="55%"
        />
      )}
    </SafeZone>
  </AbsoluteFill>
);

export const ${compositionId}: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    {/* <Audio src={voicePath} /> if voice available */}
    <Sequence from={0}   durationInFrames={180}><Scene headline="Hook line" /></Sequence>
    <Sequence from={180} durationInFrames={210}><Scene headline="Point 1" subhead="detalle" /></Sequence>
    <Sequence from={390} durationInFrames={210}><Scene headline="Point 2" assetSrc={staticFile("...")} /></Sequence>
    <Sequence from={600} durationInFrames={300}><Scene headline="CTA" subhead="..." /></Sequence>
  </AbsoluteFill>
);

The example above is ~70 lines. Your output should be similar in shape and size.
Bigger files = max_tokens truncation = render fails.`;
}

// --- Register composition in Root.tsx ---
//
// Root.tsx tiene dos pares de markers en posiciones diferentes:
//   1. `// --- GENERATED IMPORTS START/END ---` a top-level (para los imports)
//   2. `{/* --- GENERATED COMPOSITIONS START/END --- */}` adentro del JSX
//      del componente RemotionRoot (para los <Composition /> entries).
//
// Antes los dos markers eran el mismo y estaban a top-level: el <Composition>
// se inyectaba afuera del fragment del componente y Remotion arrancaba con
// "Available compositions: " vacío. Ese era el bug que rompía wiztrip_006.

function registerComposition(compositionJsId, compositionRemotionId, compositionPath) {
  const rootPath = resolve(REMOTION_DIR, "src/Root.tsx");
  let root = readFileSync(rootPath, "utf-8");

  // Import: usa compositionJsId (snake_case, válido como JS identifier).
  const importLine = `import { ${compositionJsId}, COMPOSITION_CONFIG as ${compositionJsId}_CONFIG } from "${compositionPath}";`;
  // <Composition>:
  //   - id="..." es string literal en kebab-case (compositionRemotionId).
  //     Remotion lo valida con regex /^[a-zA-Z0-9-]+$/ — underscore lo
  //     rompe.
  //   - component={...} es referencia JS al import (snake_case).
  //   - width/height/fps/durationInFrames se leen del CONFIG del módulo.
  const compositionEntry = `      <Composition
        id="${compositionRemotionId}"
        component={${compositionJsId}}
        width={${compositionJsId}_CONFIG.width}
        height={${compositionJsId}_CONFIG.height}
        fps={${compositionJsId}_CONFIG.fps}
        durationInFrames={${compositionJsId}_CONFIG.durationInFrames}
      />`;

  const importsEndMarker = "// --- GENERATED IMPORTS END ---";
  const compositionsEndMarker = "{/* --- GENERATED COMPOSITIONS END --- */}";

  if (!root.includes(importsEndMarker) || !root.includes(compositionsEndMarker)) {
    throw new Error(
      "Root.tsx no tiene los markers esperados. Esperado: " +
      `'${importsEndMarker}' y '${compositionsEndMarker}'.`,
    );
  }

  if (!root.includes(importLine)) {
    root = root.replace(
      importsEndMarker,
      `${importLine}\n${importsEndMarker}`,
    );
  }

  if (!root.includes(`id="${compositionRemotionId}"`)) {
    root = root.replace(
      compositionsEndMarker,
      `${compositionEntry}\n      ${compositionsEndMarker}`,
    );
  }

  writeFileSync(rootPath, root, "utf-8");
}

// --- Main produce function ---

export async function produceVideo(brief, storyboard, pieceId) {
  console.log("Fase 2 — Remotion video production starting...");

  // 1. Composition identifiers — DOS strings distintos por design:
  //    - compositionJsId: para JS (import, export const, variable name).
  //      JS no acepta guión en identificadores → snake_case.
  //    - compositionRemotionId: para Remotion (<Composition id="...">,
  //      CLI render arg). Remotion exige [a-zA-Z0-9-] (regex en
  //      validateCompositionId del runtime), no acepta underscore →
  //      kebab-case. Coincide con el folder name.
  //    Mezclarlos rompe en alguna dirección: si pasamos underscore al CLI
  //    falla con "Composition id can only contain a-z, A-Z, 0-9 and -".
  //    Si pasamos guión a un import JS, parse error.
  const compositionJsId = `${brief.client.replace(/-/g, "_")}_${pieceId}`;
  const compositionRemotionId = `${brief.client}-${pieceId}`;

  // 2. Create output directory for this composition (kebab-case path)
  const compositionDir = resolve(
    REMOTION_DIR,
    `src/compositions/${brief.client}-${pieceId}`
  );
  mkdirSync(compositionDir, { recursive: true });

  // 3. Sync assets desde Supabase Storage al filesystem de Remotion. El
  //    sync devuelve un map { canonicalName → publicPath } que después
  //    se inyecta al prompt para que Claude sepa qué assets puede usar
  //    y con qué path exacto.
  const assetsDir = resolve(REMOTION_DIR, `public/assets/${brief.client}`);
  console.log(`Sincronizando assets del cliente desde Supabase Storage...`);
  let assetMap = {};
  try {
    const sync = await syncClientAssets(brief.client, assetsDir);
    assetMap = sync.assetMap;
    console.log(
      `Assets sincronizados: ${sync.downloaded} descargados, ${Object.keys(assetMap).length} disponibles`,
    );
  } catch (err) {
    console.warn(
      `[produce-video] sync de assets falló (continuamos sin assets): ${err.message}`,
    );
  }
  const assetBlock = buildAssetMapBlock(assetMap);

  // 4-9. Generate + validate + render con retry loop.
  //
  // Hasta MAX_ATTEMPTS intentos: la primera vez con prompt completo, las
  // siguientes con prompt de retry pasándole a Claude el código previo + el
  // error específico para que lo arregle.
  //
  // Stages que pueden fallar y disparan retry:
  //   - "validate" : TSX no es módulo válido o tags JSX desbalanceados
  //   - "parse"    : esbuild detecta error de sintaxis
  //   - "render"   : el bundler de Remotion falla
  //
  // Si después de todos los retries seguimos fallando, propagamos el último
  // error con stderr completo para que el dashboard lo muestre.
  const MAX_ATTEMPTS = 3;
  const compositionFile = resolve(compositionDir, "index.tsx");

  // maxTokens: 32000 es el cap de output que reservamos para Claude (Sonnet
  // 4.6 soporta hasta 64000). 32000 da margen 4x sobre el peor caso observado
  // (~7500 tokens del TSX inflado de wiztrip-010). Permitir override por
  // brief.remotionMaxTokens para piezas long-form puntuales.
  const remotionMaxTokens =
    Number.isFinite(brief.remotionMaxTokens) && brief.remotionMaxTokens > 0
      ? brief.remotionMaxTokens
      : 32000;
  console.log(`[produce-video] callClaude maxTokens=${remotionMaxTokens}`);

  // Output dir + dependencias de Remotion (se setean fuera del loop — no
  // cambian entre intentos). El npm install corre ANTES del loop para que
  // tryParseTsx pueda resolver esbuild desde remotion-studio/node_modules
  // en el primer intento (sin esto, la pre-validación se skippea silenciosa).
  const videosDir = resolve(VAULT, `clients/${brief.client}/videos`);
  mkdirSync(videosDir, { recursive: true });
  const outputPath = resolve(videosDir, `${pieceId}.mp4`);

  const nodeModulesPath = resolve(REMOTION_DIR, "node_modules");
  if (!existsSync(nodeModulesPath)) {
    console.log("Installing Remotion dependencies...");
    execSync("npm install", { cwd: REMOTION_DIR, stdio: "inherit" });
  }

  let lastCode = null;
  let lastError = null;
  let registeredInRoot = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;
    console.log(
      `[produce-video] attempt ${attempt}/${MAX_ATTEMPTS}${isRetry ? " (retry tras error previo)" : ""}`,
    );

    // 4. Generate Remotion components via Claude. Le pasamos el JS identifier
    //    (snake_case) porque eso es lo que va al `export const`/`import` del
    //    TSX. El Remotion id (kebab-case) lo hardcodeamos en registerComposition.
    let prompt;
    if (isRetry && lastCode && lastError) {
      prompt = buildRetryPrompt(lastCode, lastError.message, compositionJsId);
    } else {
      console.log("Generating Remotion components...");
      prompt = buildRemotionPrompt(storyboard, brief, compositionJsId, assetBlock);
    }
    const rawRemotionCode = await callClaude(prompt, remotionMaxTokens);

    // 5a. Sanitize + validar estructura básica + balance de tags JSX.
    let remotionCode;
    try {
      remotionCode = sanitizeRemotionCode(rawRemotionCode);
      validateRemotionCode(remotionCode, compositionJsId);
      validateJsxBalance(remotionCode);
    } catch (err) {
      err._stage = "validate";
      err._stderr = null;
      err._compositionTsx = rawRemotionCode;
      err._compositionFile = compositionFile;
      lastCode = rawRemotionCode;
      lastError = err;
      console.error(
        `[produce-video] attempt ${attempt} validate failed: ${err.message.slice(0, 300)}`,
      );
      if (attempt < MAX_ATTEMPTS) continue;
      throw err;
    }

    // 5b. Write the composition file
    writeFileSync(compositionFile, remotionCode, "utf-8");
    console.log(
      `Composition written: ${compositionFile} (${remotionCode.length} chars)`,
    );

    // 5c. Pre-validar con esbuild
    const parseError = await tryParseTsx(remotionCode, compositionFile);
    if (parseError) {
      const err = new Error(
        `Composition TSX inválida (parse fail): ${parseError}\n` +
        `Esto significa que Claude emitió código con un error de sintaxis.`,
      );
      err._stage = "parse";
      err._stderr = null;
      err._compositionTsx = remotionCode;
      err._compositionFile = compositionFile;
      lastCode = remotionCode;
      lastError = err;
      console.error(
        `[produce-video] attempt ${attempt} esbuild parse failed: ${parseError.slice(0, 400)}`,
      );
      if (attempt < MAX_ATTEMPTS) continue;
      throw err;
    }

    // 6. Register in Root.tsx (solo la primera vez que llegamos acá)
    if (!registeredInRoot) {
      const relativeCompositionPath = `./compositions/${brief.client}-${pieceId}/index`;
      registerComposition(compositionJsId, compositionRemotionId, relativeCompositionPath);
      console.log(`Composition registered: ${compositionRemotionId}`);
      registeredInRoot = true;
    }

    // 7. Render — el CLI de Remotion exige el id en kebab-case (con guión).
    console.log(
      `Rendering video: ${compositionRemotionId}... (attempt ${attempt}/${MAX_ATTEMPTS})`,
    );
    console.log(
      "Preview available at http://localhost:3000 (run: npm run studio)",
    );

    try {
      const renderResult = execSync(
        `npx remotion render src/index.ts ${compositionRemotionId} --output "${outputPath}" --log=verbose`,
        {
          cwd: REMOTION_DIR,
          stdio: "pipe",
          timeout: 300000,
          encoding: "utf-8",
        },
      );
      if (renderResult) console.log(renderResult);
      console.log(
        `Video rendered: ${outputPath} (en attempt ${attempt}/${MAX_ATTEMPTS})`,
      );
      return { outputPath, compositionTsx: remotionCode, compositionFile };
    } catch (err) {
      // El bundler de Remotion imprime la causa al INICIO del stderr (e.g.
      // "Could not resolve '@remotion/google-fonts/Foo'") y luego pinta el
      // stack de Node. El final del stderr es ruido — buscamos la primera
      // línea con "error" para enmarcar 20 líneas desde ahí.
      const rawStderr = err.stderr ? err.stderr.toString() : "";
      const rawStdout = err.stdout ? err.stdout.toString() : "";
      const stderr = stripAnsi(rawStderr);
      const stdout = stripAnsi(rawStdout);
      if (stdout) console.log("--- Remotion stdout ---\n" + stdout);
      if (stderr) console.error("--- Remotion stderr ---\n" + stderr);

      const lines = stderr.trim().split(/\r?\n/);
      const firstErrorIdx = lines.findIndex((l) =>
        /\b(error|Error|Failed|failed)\b/.test(l),
      );
      const window =
        firstErrorIdx >= 0
          ? lines.slice(firstErrorIdx, firstErrorIdx + 20)
          : lines.slice(-20);
      const message = window.join("\n").slice(0, 3000) || err.message;

      const richError = new Error(
        `Remotion render failed: ${message}\n` +
        `Para reproducir local: cd remotion-studio && npm run studio`,
      );
      richError._stage = "render";
      richError._stderr = stderr.slice(0, 6000);
      richError._compositionTsx = remotionCode;
      richError._compositionFile = compositionFile;
      lastCode = remotionCode;
      lastError = richError;
      console.error(
        `[produce-video] attempt ${attempt} render failed: ${message.slice(0, 300)}`,
      );
      if (attempt < MAX_ATTEMPTS) continue;
      throw richError;
    }
  }

  // No deberíamos llegar acá (el loop siempre return o throw), pero por
  // seguridad TypeScript-grade:
  throw lastError ?? new Error("produceVideo failed sin error capturado");
}
