/**
 * Social Media Metrics Agent — Brief Schema
 *
 * Contract for how any source communicates with the Metrics Agent.
 * Sources: Consultant Agent, Dashboard, CLI (manual), GitHub Actions (cron)
 *
 * The Metrics Agent handles:
 * - Collecting metrics from published posts (social-media-log.md)
 * - Evaluating each piece: winner / average / loser
 * - Updating content-library.md with real performance data
 * - Updating hook-database.md when winners are found
 * - Updating learning-log.md when losers are identified
 * - Generating weekly performance reports
 *
 * Modes:
 * - "daily":  Collect metrics for recent posts, evaluate, update vault
 * - "weekly": Full performance report + trends + recommendations
 */

/** @typedef {Object} MetricsBrief
 *
 * @property {string} client - Client slug (e.g. "dmancuello")
 * @property {string} source - Who triggered: "cli" | "consultant-agent" | "dashboard" | "github-actions"
 * @property {string} mode - "daily" | "weekly"
 * @property {number} [lookbackDays] - How many days back to collect metrics (default: 1 for daily, 7 for weekly)
 * @property {string[]} [platforms] - Filter to specific platforms (default: all)
 * @property {string} [instructions] - Extra instructions from Consultant Agent or owner
 */

export const DEFAULT_BRIEF = {
  client: "dmancuello",
  source: "cli",
  mode: "daily",
  lookbackDays: null,
  platforms: null,
  instructions: null,
};

const VALID_MODES = ["daily", "weekly"];
const VALID_PLATFORMS = ["instagram", "tiktok", "linkedin", "facebook", "twitter"];

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  if (!VALID_MODES.includes(brief.mode)) {
    throw new Error(`Invalid mode "${brief.mode}". Valid: ${VALID_MODES.join(", ")}`);
  }

  // Default lookback based on mode
  if (brief.lookbackDays === null) {
    brief.lookbackDays = brief.mode === "weekly" ? 7 : 1;
  }

  // Validate platforms filter if provided
  if (brief.platforms) {
    if (!Array.isArray(brief.platforms) || brief.platforms.length === 0) {
      throw new Error("platforms must be a non-empty array");
    }
    for (const p of brief.platforms) {
      if (!VALID_PLATFORMS.includes(p)) {
        throw new Error(`Invalid platform "${p}". Valid: ${VALID_PLATFORMS.join(", ")}`);
      }
    }
  }

  return brief;
}
