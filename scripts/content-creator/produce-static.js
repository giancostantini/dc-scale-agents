/**
 * Content Creator Agent — Google AI (Gemini) Static Producer (Fase 3)
 *
 * Uses gemini-3-pro-image-preview via Google AI Studio API
 * Called by index.js when brief.produceStatic === true and pieceType !== "reel"
 *
 * Flow:
 *   1. Extracts the NanoBanana brief section from Claude's static output
 *   2. Builds an optimized image generation prompt
 *   3. Calls Google AI API (gemini-3-pro-image-preview)
 *   4. Saves the image to vault/clients/[client]/statics/
 *   5. Returns the image file path
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(__dirname, "../../vault");

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

// --- Aspect ratios per piece type ---
const ASPECT_RATIOS = {
  "static-ad":      "4:5",   // Instagram feed ad
  "social-review":  "4:5",   // Instagram feed
  "headline-ad":    "1:1",   // Square — works on all platforms
  "collage-ad":     "4:5",   // Instagram feed
  "carousel":       "1:1",   // Square carousel
};

// --- Extract NanoBanana brief from Claude's static output ---

export function extractStaticBrief(staticOutput) {
  const marker = "## Brief para NanoBanana Pro";
  const startIdx = staticOutput.indexOf(marker);

  if (startIdx === -1) {
    // Fallback: use the full output as prompt
    return staticOutput.substring(0, 1500).trim();
  }

  const afterMarker = staticOutput.substring(startIdx + marker.length).trim();

  // Extract content inside code block if present
  const codeBlockMatch = afterMarker.match(/```[\s\S]*?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Otherwise take until next ## section
  const nextSectionMatch = afterMarker.match(/^## /m);
  return nextSectionMatch
    ? afterMarker.substring(0, nextSectionMatch.index).trim()
    : afterMarker.substring(0, 1500).trim();
}

// --- Build image generation prompt ---

function buildImagePrompt(briefText, pieceType, clientBrand) {
  const styleGuide = {
    "static-ad":
      "Professional product advertisement. Clean layout, strong typography, clear visual hierarchy. Product is the hero.",
    "social-review":
      "Authentic social proof post. Warm, organic feel. Includes customer photo or avatar, review text, and product. Feels real, not corporate.",
    "headline-ad":
      "Bold retargeting ad. Huge impactful headline dominates. Minimal elements. Ultra clear message. Strong contrast.",
    "collage-ad":
      "UGC-style collage. Multiple product angles or lifestyle shots arranged naturally. Feels like real user content. Organic and authentic.",
    "carousel":
      "Clean educational or product showcase slide. Consistent visual style. Easy to read at a glance.",
  };

  return `Create a high-quality social media ${pieceType} image for Instagram.

DESIGN BRIEF:
${briefText}

STYLE REQUIREMENTS:
${styleGuide[pieceType] || "Clean, professional social media image."}

TECHNICAL REQUIREMENTS:
- High resolution, production-ready
- Mobile-optimized — text must be legible on a small screen
- Safe margins: keep all text and key elements at least 5% from edges
- No watermarks, no text that says "placeholder"
- Photorealistic product photography style when showing products
- Professional advertising quality

OUTPUT: A single, complete, ready-to-publish social media image.`;
}

// --- Call Google AI API ---

async function generateImage(prompt, aspectRatio = "4:5") {
  if (!GOOGLE_AI_API_KEY) {
    throw new Error("GOOGLE_AI_API_KEY not set");
  }

  const res = await fetch(`${GEMINI_API_URL}?key=${GOOGLE_AI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["image"],
        aspectRatio,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google AI API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Extract base64 image from response
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error("No image returned from Google AI API");
  }

  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart) {
    throw new Error("No image data in Google AI API response");
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

// --- Main produce function ---

export async function produceStatic(brief, staticOutput, pieceId) {
  console.log(`Fase 3 — Google AI static generation starting (${brief.pieceType})...`);

  // 1. Extract brief text from Claude's output
  const briefText = extractStaticBrief(staticOutput);
  console.log("Static brief extracted.");

  // 2. Build image prompt
  const imagePrompt = buildImagePrompt(briefText, brief.pieceType);

  // 3. Determine aspect ratio
  const aspectRatio = ASPECT_RATIOS[brief.pieceType] || "1:1";
  console.log(`Calling Google AI (${GEMINI_IMAGE_MODEL}) — aspect ratio ${aspectRatio}...`);

  // 4. Generate image
  const { base64, mimeType } = await generateImage(imagePrompt, aspectRatio);

  // 5. Save image file
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const staticsDir = resolve(VAULT, `clients/${brief.client}/statics`);
  mkdirSync(staticsDir, { recursive: true });

  const imageFileName = `${pieceId}-${brief.pieceType}.${ext}`;
  const imageFilePath = resolve(staticsDir, imageFileName);
  writeFileSync(imageFilePath, Buffer.from(base64, "base64"));

  console.log(`Static saved: ${imageFilePath}`);

  return {
    filePath: imageFilePath,
    fileName: imageFileName,
    mimeType,
    aspectRatio,
  };
}
