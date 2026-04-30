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
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { syncClientAssets, buildAssetMapBlock } from "../lib/asset-sync.js";
import { loadBrandFiles } from "../lib/brand-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = resolve(__dirname, "../../remotion-studio");
const VAULT = resolve(__dirname, "../../vault");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(prompt, maxTokens = 8000) {
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

COMPOSITION ID: ${compositionId}
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
1. All text MUST be inside <SafeZone> — never place text outside safe zone
2. Background images use <ImageScene> OUTSIDE SafeZone (full bleed)
3. Use ONLY hex codes from the IDENTIDAD VISUAL section above. Don't invent palette.
4. First 3 seconds (frames 0-90): 6+ visual changes for pattern interruption
5. Text hook must appear within first 30 frames (1 second)
6. Each scene transition should use either hard cut, FadeTransition, or FlashTransition
7. If no image assets available for a frame, use ColorScene with brand gradient using palette hex
8. Cuando referencies un asset del library (logos, mascot, patterns), usá EXACTAMENTE el publicPath listado en ASSETS DISPONIBLES arriba con \`staticFile(...)\`. NO inventes paths.
9. Si el storyboard menciona un asset que NO está en ASSETS DISPONIBLES, sustituílo por un placeholder visual razonable (ColorScene + texto descriptivo) y agregá un comentario \`// TODO MISSING ASSET: <descripción>\` en el código.
10. Font sizes: títulos hook 64-80px, subtítulos 36-48px, cuerpo 24-32px (escalas del brandbook).

--- OUTPUT FORMAT ---
Output ONLY a single TypeScript/TSX file. No explanations, no markdown fences.
The file must:
- Be a valid React/Remotion component
- Export a default component named ${compositionId}
- Export a const COMPOSITION_CONFIG with: { id, width: 1080, height: 1920, fps: 30, durationInFrames }
- Use only the templates listed above + Remotion core imports + @remotion/google-fonts imports

Example structure:
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, staticFile, Img } from "remotion";
import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadHostGrotesk } from "@remotion/google-fonts/HostGrotesk";
import { TextOverlay } from "../../templates/TextOverlay";
import { ImageScene } from "../../templates/ImageScene";
import { SafeZone } from "../../templates/SafeZone";
import { FadeTransition } from "../../templates/Transition";

const { fontFamily: bricolage } = loadBricolage();
const { fontFamily: hostGrotesk } = loadHostGrotesk();

export const COMPOSITION_CONFIG = {
  id: "${compositionId}",
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 900, // 30 seconds
};

export const ${compositionId}: React.FC = () => {
  // ... scenes
};`;
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

function registerComposition(compositionId, compositionPath) {
  const rootPath = resolve(REMOTION_DIR, "src/Root.tsx");
  let root = readFileSync(rootPath, "utf-8");

  const importLine = `import { ${compositionId}, COMPOSITION_CONFIG as ${compositionId}_CONFIG } from "${compositionPath}";`;
  const compositionEntry = `      <Composition
        id={${compositionId}_CONFIG.id}
        component={${compositionId}}
        width={${compositionId}_CONFIG.width}
        height={${compositionId}_CONFIG.height}
        fps={${compositionId}_CONFIG.fps}
        durationInFrames={${compositionId}_CONFIG.durationInFrames}
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

  if (!root.includes(`id={${compositionId}_CONFIG.id}`)) {
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

  // 1. Create composition ID
  const compositionId = `${brief.client.replace(/-/g, "_")}_${pieceId}`;

  // 2. Create output directory for this composition
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

  // 4. Generate Remotion components via Claude
  console.log("Generating Remotion components...");
  const remotionPrompt = buildRemotionPrompt(
    storyboard,
    brief,
    compositionId,
    assetBlock,
  );
  const remotionCode = await callClaude(remotionPrompt);

  // 5. Write the composition file
  const compositionFile = resolve(compositionDir, "index.tsx");
  writeFileSync(compositionFile, remotionCode, "utf-8");
  console.log(`Composition written: ${compositionFile}`);

  // 6. Register in Root.tsx
  const relativeCompositionPath = `./compositions/${brief.client}-${pieceId}/index`;
  registerComposition(compositionId, relativeCompositionPath);
  console.log(`Composition registered: ${compositionId}`);

  // 7. Create output directory
  const videosDir = resolve(VAULT, `clients/${brief.client}/videos`);
  mkdirSync(videosDir, { recursive: true });
  const outputPath = resolve(videosDir, `${pieceId}.mp4`);

  // 8. Install dependencies if needed
  const nodeModulesPath = resolve(REMOTION_DIR, "node_modules");
  if (!existsSync(nodeModulesPath)) {
    console.log("Installing Remotion dependencies...");
    execSync("npm install", { cwd: REMOTION_DIR, stdio: "inherit" });
  }

  // 9. Render the video
  console.log(`Rendering video: ${compositionId}...`);
  console.log("Preview available at http://localhost:3000 (run: npm run studio)");

  try {
    // stdio "pipe" para capturar stderr — antes era "inherit" y el catch solo
    // recibía "Command failed: npx remotion render ..." sin la causa real.
    // El log del runner se sigue viendo en console.log debajo (se imprime el
    // stderr de Remotion entero al final si el render falla).
    const renderResult = execSync(
      `npx remotion render src/index.ts ${compositionId} --output "${outputPath}" --log=verbose`,
      { cwd: REMOTION_DIR, stdio: "pipe", timeout: 300000, encoding: "utf-8" },
    );
    if (renderResult) console.log(renderResult);
    console.log(`Video rendered: ${outputPath}`);
    return outputPath;
  } catch (err) {
    // err.stderr / err.stdout existen cuando stdio es "pipe". Los volcamos
    // al log para que aparezcan en GHA, y guardamos los últimos 500 chars
    // del stderr en err.message para que el frontend pueda mostrarlo.
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    if (stdout) console.log("--- Remotion stdout ---\n" + stdout);
    if (stderr) console.error("--- Remotion stderr ---\n" + stderr);
    const tail = stderr.trim().split("\n").slice(-8).join("\n").slice(-500);
    throw new Error(
      `Remotion render failed: ${tail || err.message}\n` +
      `Para reproducir local: cd remotion-studio && npm run studio`,
    );
  }
}
