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
      model: "claude-sonnet-4-20250514",
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

function buildRemotionPrompt(storyboard, brief, compositionId) {
  const brandColors = brief.visual?.palette || ["#8B4513", "#F5F0EB", "#2C1810", "#FFFFFF"];
  const style = brief.visual?.style || "artisanal";

  return `You are an expert Remotion (React video framework) developer.

Generate a complete, production-ready Remotion composition based on this storyboard.

COMPOSITION ID: ${compositionId}
CLIENT: ${brief.client}
VISUAL STYLE: ${style}
BRAND COLORS: ${brandColors.join(", ")}
ASPECT RATIO: 9:16 (1080x1920 — vertical video for Instagram Reels / TikTok)
FPS: 30
SAFE ZONE: No text/important elements in top 150px or bottom 250px (platform UI)

--- STORYBOARD ---
${storyboard}

--- AVAILABLE TEMPLATES ---
Import from these paths (they are already created):
- "../templates/TextOverlay" → TextOverlay component
  Props: text, fontSize, fontWeight, color, top, bottom, left, right, align, animation ("fade-in"|"slide-up"|"scale-in"|"none"), delay, backgroundColor, padding, maxWidth

- "../templates/ImageScene" → ImageScene component
  Props: src, objectFit, animation ("zoom-in"|"zoom-out"|"pan-right"|"pan-left"|"none"), overlayColor, overlayOpacity, brightness

- "../templates/ColorScene" → ColorScene component
  Props: color, gradient ({from, to, direction}), children

- "../templates/Transition" → FadeTransition, FlashTransition components
  Props: children, durationInFrames

- "../templates/SafeZone" → SafeZone component (wraps content within safe area)
  Props: children, showGuides

From remotion, use: AbsoluteFill, Sequence, useCurrentFrame, interpolate, Audio, Video, Img, spring

--- RULES ---
1. All text MUST be inside <SafeZone> — never place text outside safe zone
2. Background images use <ImageScene> OUTSIDE SafeZone (full bleed)
3. Use brand colors for text and backgrounds
4. First 3 seconds (frames 0-90): 6+ visual changes for pattern interruption
5. Text hook must appear within first 30 frames (1 second)
6. Each scene transition should use either hard cut, FadeTransition, or FlashTransition
7. If no image assets available, use ColorScene with brand gradient
8. Font: use system fonts — 'Inter', 'Helvetica Neue', Arial, sans-serif
9. Generate realistic placeholder image paths like: /assets/[client]/scene-01.jpg
   (these will be replaced with real assets before rendering)

--- OUTPUT FORMAT ---
Output ONLY a single TypeScript/TSX file. No explanations, no markdown fences.
The file must:
- Be a valid React/Remotion component
- Export a default component named ${compositionId}
- Export a const COMPOSITION_CONFIG with: { id, width: 1080, height: 1920, fps: 30, durationInFrames }
- Use only the templates listed above + Remotion core imports

Example structure:
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { TextOverlay } from "../templates/TextOverlay";
import { ImageScene } from "../templates/ImageScene";
import { SafeZone } from "../templates/SafeZone";
import { FadeTransition } from "../templates/Transition";

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

  // Add import after last import or at top
  const importMarker = "// --- GENERATED COMPOSITIONS START ---";
  const compositionMarker = "// --- GENERATED COMPOSITIONS END ---";

  if (!root.includes(importLine)) {
    root = root.replace(
      importMarker,
      `${importMarker}\n${importLine}`
    );
  }

  if (!root.includes(compositionId + "_CONFIG")) {
    root = root.replace(
      compositionMarker,
      `${compositionEntry}\n      ${compositionMarker}`
    );
    // Add Composition import if not there
    if (!root.includes("{ Composition }")) {
      root = root.replace(
        `import { Composition } from "remotion";`,
        `import { Composition } from "remotion";`
      );
    }
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

  // 3. Create assets directory for client if not exists
  const assetsDir = resolve(REMOTION_DIR, `public/assets/${brief.client}`);
  mkdirSync(assetsDir, { recursive: true });

  // 4. Generate Remotion components via Claude
  console.log("Generating Remotion components...");
  const remotionPrompt = buildRemotionPrompt(storyboard, brief, compositionId);
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
    execSync(
      `npx remotion render src/index.ts ${compositionId} --output "${outputPath}" --log=verbose`,
      { cwd: REMOTION_DIR, stdio: "inherit", timeout: 300000 }
    );
    console.log(`Video rendered: ${outputPath}`);
    return outputPath;
  } catch (err) {
    throw new Error(
      `Remotion render failed: ${err.message}\n` +
      `Preview manually at: cd remotion-studio && npm run studio`
    );
  }
}
