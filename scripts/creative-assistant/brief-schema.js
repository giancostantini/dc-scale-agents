/**
 * Asistente Creativo — Brief Schema
 *
 * Contrato de cómo cualquier source le pide un brief creativo al Asistente.
 * El agente genera un BRIEF (idea + ángulo + copy + dirección visual) para
 * que la CM y el editor lo ejecuten. NO produce el video/static.
 *
 * Sources: Consultant Agent, Dashboard (dueño), Estrategia de Contenido (calendario), CLI
 *
 * El brief puede llegar como:
 * - CLI: node index.js --brief path/to/brief.json
 * - CLI shorthand: node index.js <client> <pieceType>
 * - Dashboard/Consultor: dispatch via repository_dispatch
 */

/**
 * @typedef {Object} ContentBrief
 *
 * @property {string} client - Client slug (e.g. "<client-slug>") — required, no defaults
 * @property {string} pieceType - "reel" | "static-ad" | "social-review" | "headline-ad" | "collage-ad" | "carousel"
 * @property {string} source - Who triggered this: "cli" | "consultant-agent" | "dashboard" | "strategy-agent"
 *
 * --- Creative direction (optional, progressively filled by Consultant Agent) ---
 * @property {string} [objective] - "viral" | "sales" | "value" | "branding"
 * @property {string} [scriptFormat] - "double-drop" | "direct-value" | "3x-ranking" | null (let agent decide)
 * @property {string} [emotionalTrigger] - "anger" | "awe" | "empathy" | "fear" | null (let agent decide)
 * @property {string} [hookStyle] - Specific hook text or style preference
 * @property {string} [tone] - Override for tone (e.g. "more aggressive", "softer", "humorous")
 * @property {string} [angle] - Specific content angle or topic
 * @property {string} [targetAudience] - Specific audience segment for this piece
 * @property {string} [cta] - Specific call-to-action to use
 *
 * --- Voice guidance (para que la CM grabe / para subtítulos) ---
 * @property {Object} [voice]
 * @property {string} [voice.style] - "narration" | "conversational" | "energetic"
 * @property {string} [voice.language] - "es" | "en" | "pt"
 *
 * --- Visual guidance (dirección para el editor) ---
 * @property {Object} [visual]
 * @property {string} [visual.style] - estilo según brandbook
 * @property {string[]} [visual.palette] - paleta override (default: la del brandbook)
 * @property {string} [visual.aspectRatio] - "9:16" | "1:1" | "16:9"
 *
 * --- Reference examples ---
 * @property {Object[]} [examples] - Reference content to use as inspiration
 * @property {string} examples[].type - "video" | "static" | "caption"
 * @property {string} examples[].url - URL to the reference (YouTube, Instagram, TikTok, direct file URL)
 * @property {string} [examples[].filePath] - Local file path (uploaded via dashboard)
 * @property {string} [examples[].notes] - What to take from this example ("use this hook style", "match this pacing")
 *
 * --- Instructions ---
 * @property {string} [instructions] - Free-text instructions from Consultant Agent or business owner
 * @property {string} [calendarEntryId] - Links to a specific content-calendar.md entry
 *
 * --- Performance-driven prioritization (injected by the Consultant from content_insights) ---
 * @property {Object} [prioritize]
 * @property {string[]} [prioritize.hook] - Top hooks by historical score
 * @property {string[]} [prioritize.format] - Top formats by historical score
 * @property {string[]} [prioritize.angle] - Top angles by historical score
 * @property {string[]} [prioritize.publish_time] - Best historical publish times (HH:MM)
 *
 * --- Cross-posting (sugerencia para la CM al publicar) ---
 * @property {string[]} [crossPost] - Plataformas adicionales sugeridas e.g. ["tiktok", "instagram-stories"]
 *
 * --- Prompt para IA generativa (opt-in, on-request) ---
 * @property {boolean} [generateAiPrompt] - Si true, el agente suma una sección con un prompt listo para pegar en una IA de imagen/video.
 * @property {string} [aiPromptTool] - Herramienta destino (e.g. "ChatGPT/DALL·E", "Sora", "NanoBanana Pro", "Midjourney"). Si null → prompt genérico.
 */

/** Default brief — used when no brief file is provided. `client` is null on
 * purpose (generic-first): the CLI or dispatcher must always specify it. */
export const DEFAULT_BRIEF = {
  client: null,
  pieceType: "reel",
  source: "cli",
  objective: null,
  scriptFormat: null,
  emotionalTrigger: null,
  hookStyle: null,
  tone: null,
  angle: null,
  targetAudience: null,
  cta: null,
  voice: null,
  visual: null,
  examples: [],
  instructions: null,
  calendarEntryId: null,
  prioritize: null,
  crossPost: [],
  generateAiPrompt: false,
  aiPromptTool: null,
};

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  const validTypes = [
    "reel",
    "static-ad",
    "social-review",
    "headline-ad",
    "collage-ad",
    "carousel",
  ];
  if (!validTypes.includes(brief.pieceType)) {
    throw new Error(
      `Invalid pieceType "${brief.pieceType}". Valid: ${validTypes.join(", ")}`
    );
  }

  return brief;
}
