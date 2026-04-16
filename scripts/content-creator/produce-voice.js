/**
 * Content Creator Agent — ElevenLabs Voice Producer (Fase 3)
 *
 * Called by index.js when brief.generateVoice === true
 * Flow:
 *   1. Extracts narration text from the storyboard output
 *   2. Calls ElevenLabs API with voice settings from the brief
 *   3. Saves the audio file to remotion-studio/public/assets/[client]/
 *   4. Returns the audio file path (used by Remotion's <Audio> component)
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REMOTION_DIR = resolve(__dirname, "../../remotion-studio");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Default voice IDs — can be overridden per client in the brief
// These are ElevenLabs preset voices, no cloning needed
const DEFAULT_VOICES = {
  es: "pNInz6obpgDQGcFmaJgB", // Adam — clear male voice, works well in Spanish
  en: "21m00Tcm4TlvDq8ikWAM", // Rachel — clear female voice
  pt: "AZnzlk1XvdvUeBnXmlld", // Domi — works for Portuguese
};

// --- Extract narration text from storyboard output ---

export function extractNarration(storyboardOutput) {
  // Look for the "Texto de narracion completo" section
  const marker = "## Texto de narracion completo";
  const nextSectionMarker = /^## /m;

  const startIdx = storyboardOutput.indexOf(marker);
  if (startIdx === -1) {
    // Fallback: extract all "Narracion:" lines from the script
    const lines = storyboardOutput.split("\n");
    const narrationLines = lines
      .filter((line) => line.trim().toLowerCase().startsWith("narracion:"))
      .map((line) => line.replace(/^.*?narracion:\s*/i, "").trim())
      .filter(Boolean);

    if (narrationLines.length > 0) {
      return narrationLines.join(" ");
    }

    return null;
  }

  // Extract content between this section and the next ## section
  const afterMarker = storyboardOutput.substring(startIdx + marker.length).trim();
  const nextSectionMatch = afterMarker.match(nextSectionMarker);
  const narrationText = nextSectionMatch
    ? afterMarker.substring(0, nextSectionMatch.index).trim()
    : afterMarker.trim();

  // Clean up markdown formatting
  return narrationText
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/\[.*?\]/g, "") // remove markdown links
    .trim();
}

// --- Call ElevenLabs API ---

async function generateAudio(text, voiceId, stability = 0.5, similarityBoost = 0.75) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY not set");
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2", // supports Spanish, English, Portuguese
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// --- Main produce function ---

export async function produceVoice(brief, storyboardOutput, pieceId) {
  console.log("Fase 3 — ElevenLabs voice generation starting...");

  // 1. Extract narration text
  const narrationText = extractNarration(storyboardOutput);
  if (!narrationText) {
    throw new Error(
      "No narration text found in storyboard output. " +
      "Make sure the script has a '## Texto de narracion completo' section."
    );
  }

  console.log(`Narration extracted: ${narrationText.substring(0, 80)}...`);

  // 2. Determine voice settings from brief
  const voiceConfig = brief.voice || {};
  const language = voiceConfig.language || "es";
  const voiceId = voiceConfig.voiceId || DEFAULT_VOICES[language] || DEFAULT_VOICES.es;
  const voiceStyle = voiceConfig.style || "narration";

  // Map voice style to ElevenLabs stability/similarity settings
  const voiceSettings = {
    narration:    { stability: 0.55, similarityBoost: 0.75 }, // clear, steady
    conversational: { stability: 0.35, similarityBoost: 0.80 }, // natural, varied
    energetic:    { stability: 0.25, similarityBoost: 0.85 }, // expressive, dynamic
  };

  const { stability, similarityBoost } = voiceSettings[voiceStyle] || voiceSettings.narration;

  console.log(`Voice: ${voiceId} | Style: ${voiceStyle} | Language: ${language}`);

  // 3. Generate audio
  console.log("Calling ElevenLabs API...");
  const audioBuffer = await generateAudio(narrationText, voiceId, stability, similarityBoost);

  // 4. Save audio file
  const assetsDir = resolve(REMOTION_DIR, `public/assets/${brief.client}`);
  mkdirSync(assetsDir, { recursive: true });

  const audioFileName = `voice-${pieceId}.mp3`;
  const audioFilePath = resolve(assetsDir, audioFileName);
  writeFileSync(audioFilePath, audioBuffer);

  console.log(`Audio saved: ${audioFilePath}`);

  // Return the public path for Remotion's <Audio> component
  // Remotion serves files from remotion-studio/public/ at root
  const remotionPublicPath = `/assets/${brief.client}/${audioFileName}`;

  return {
    filePath: audioFilePath,
    remotionPath: remotionPublicPath,
    durationEstimateSeconds: Math.ceil(narrationText.split(" ").length / 2.5), // ~2.5 words/sec
    narrationText,
  };
}
