/**
 * Content Creator Agent — Brief Schema
 *
 * This is the contract for how any source communicates with the Content Creator.
 * Sources: Consultant Agent, Dashboard (business owner), Strategy Agent (calendar), CLI (manual)
 *
 * The brief can arrive as:
 * - CLI: node index.js --brief path/to/brief.json
 * - CLI shorthand: node index.js <client> <pieceType> (minimal brief, uses defaults)
 * - API (future): POST /api/content-creator with JSON body
 * - Consultant Agent (future): calls createContent(brief) directly
 * - Dashboard (future): form submission → builds brief JSON → sends to API
 */

/**
 * @typedef {Object} ContentBrief
 *
 * @property {string} client - Client slug (e.g. "dmancuello")
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
 * --- Voice settings (for video, future Fase 3) ---
 * @property {Object} [voice]
 * @property {string} [voice.provider] - "elevenlabs" (default)
 * @property {string} [voice.voiceId] - ElevenLabs voice ID
 * @property {string} [voice.style] - "narration" | "conversational" | "energetic"
 * @property {string} [voice.language] - "es" | "en" | "pt"
 *
 * --- Visual settings (future Fase 2-3) ---
 * @property {Object} [visual]
 * @property {string} [visual.style] - "premium" | "artisanal" | "lifestyle" | "organic" | "minimalist" | "ugc"
 * @property {string[]} [visual.palette] - Brand colors override
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
 * --- Production flags (future) ---
 * @property {boolean} [produceVideo] - false in Fase 1, true when Remotion is connected
 * @property {boolean} [produceStatic] - false in Fase 1, true when NanoBanana is connected
 * @property {boolean} [generateVoice] - false in Fase 1, true when ElevenLabs is connected
 * @property {boolean} [autoPublish] - false until Blotato is connected
 * @property {string[]} [crossPost] - Additional platforms to cross-post to
 *   e.g. ["tiktok", "instagram-stories"] — uses PLATFORM_MAP keys in produce-publish.js
 * @property {string} [scheduleTime] - ISO 8601 datetime to schedule post (null = publish immediately)
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
  produceVideo: false,
  produceStatic: false,
  generateVoice: false,
  autoPublish: false,
  crossPost: [],
  scheduleTime: null,
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
