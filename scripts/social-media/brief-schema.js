/**
 * Social Media Agent — Brief Schema
 *
 * This is the contract for how any source communicates with the Social Media Agent.
 * Sources: Consultant Agent, Dashboard (business owner), Content Creator Agent, CLI (manual)
 *
 * The Social Media Agent receives APPROVED content and handles:
 * - Adapting captions per platform (Instagram, TikTok, LinkedIn, Facebook, Twitter)
 * - Scheduling optimal publish times based on vault metrics
 * - Publishing via Blotato MCP (when autoPublish = true)
 * - Registering publication status in social-media-log.md
 *
 * The brief can arrive as:
 * - CLI: node index.js --brief path/to/brief.json
 * - CLI shorthand: node index.js <client> <contentPieceId> (minimal brief)
 * - Consultant Agent (future): calls publishContent(brief) directly
 * - Dashboard (future): form submission -> builds brief JSON -> sends to API
 * - Content Creator Agent (future): chains after content approval
 */

/**
 * @typedef {Object} SocialMediaBrief
 *
 * @property {string} client - Client slug (e.g. "dmancuello")
 * @property {string} source - Who triggered this: "cli" | "consultant-agent" | "dashboard" | "content-creator-agent"
 *
 * --- Content to publish ---
 * @property {string[]} platforms - Platforms to publish on: "instagram" | "tiktok" | "linkedin" | "facebook" | "twitter"
 * @property {string} contentType - "reel" | "static-ad" | "carousel" | "story" | "text-post"
 * @property {string} [contentPieceId] - Reference to content-library.md piece ID (e.g. "042")
 * @property {string} [contentText] - Raw content/caption text (if not referencing a piece)
 * @property {string} [mediaPath] - Path to media file (image/video) relative to vault
 * @property {string} [mediaUrl] - External URL to media file
 *
 * --- Caption direction ---
 * @property {string} [tone] - Override tone for captions (e.g. "professional", "casual", "bold")
 * @property {string} [angle] - Content angle or topic focus
 * @property {string} [cta] - Specific call-to-action to use
 * @property {number} [maxHashtags] - Max hashtags per platform (default: 8 for IG, 5 for others)
 * @property {string} [instructions] - Free-text instructions from Consultant Agent or owner
 *
 * --- Scheduling ---
 * @property {string} [scheduledDate] - ISO date for scheduled publish (e.g. "2026-04-08")
 * @property {string} [scheduledTime] - Time in HH:MM format, UTC (e.g. "14:00")
 * @property {boolean} [autoSchedule] - Let agent pick optimal time from metrics (default: false)
 *
 * --- Publishing flags ---
 * @property {boolean} [autoPublish] - false until Blotato MCP is connected (default: false)
 * @property {boolean} [requireApproval] - Wait for owner approval before publishing (default: true)
 *
 * --- Reference examples ---
 * @property {Object[]} [examples] - Reference posts to use as style inspiration
 * @property {string} examples[].platform - "instagram" | "tiktok" | "linkedin" | "facebook" | "twitter"
 * @property {string} examples[].url - URL to the reference post
 * @property {string} [examples[].notes] - What to emulate from this example
 */

/** Default brief */
export const DEFAULT_BRIEF = {
  client: "dmancuello",
  source: "cli",
  platforms: ["instagram", "tiktok", "linkedin", "facebook", "twitter"],
  contentType: "reel",
  contentPieceId: null,
  contentText: null,
  mediaPath: null,
  mediaUrl: null,
  tone: null,
  angle: null,
  cta: null,
  maxHashtags: null,
  instructions: null,
  scheduledDate: null,
  scheduledTime: null,
  autoSchedule: false,
  autoPublish: false,
  requireApproval: true,
  examples: [],
};

const VALID_PLATFORMS = ["instagram", "tiktok", "linkedin", "facebook", "twitter"];
const VALID_CONTENT_TYPES = ["reel", "static-ad", "carousel", "story", "text-post"];

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  if (!VALID_CONTENT_TYPES.includes(brief.contentType)) {
    throw new Error(
      `Invalid contentType "${brief.contentType}". Valid: ${VALID_CONTENT_TYPES.join(", ")}`
    );
  }

  // Validate platforms
  if (!Array.isArray(brief.platforms) || brief.platforms.length === 0) {
    throw new Error("Brief must include at least one platform");
  }
  for (const p of brief.platforms) {
    if (!VALID_PLATFORMS.includes(p)) {
      throw new Error(
        `Invalid platform "${p}". Valid: ${VALID_PLATFORMS.join(", ")}`
      );
    }
  }

  // Must have either a content piece reference or raw content
  if (!brief.contentPieceId && !brief.contentText) {
    console.warn("Warning: no contentPieceId or contentText provided. Agent will generate captions from client context only.");
  }

  return brief;
}
