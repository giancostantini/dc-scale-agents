/**
 * Meta Ads Agent — Brief Schema
 *
 * Contract for how any source communicates with the Meta Ads Agent.
 * Sources: Consultant Agent, Dashboard, CLI (manual), GitHub Actions (cron)
 *
 * The Meta Ads Agent handles:
 * - Creating new campaigns/ad sets/ads in Meta (Facebook + Instagram)
 * - Activating and deactivating campaigns
 * - Budget optimization recommendations
 * - Performance analysis and ROAS tracking
 * - Requesting ad creatives from Content Creator Agent when needed
 * - Audience strategy and targeting recommendations
 *
 * Modes:
 * - "audit":     Analyze current campaigns, find waste, suggest optimizations
 * - "create":    Create a new campaign structure (campaign + ad sets + ads)
 * - "optimize":  Review active campaigns and adjust budgets/audiences/placements
 * - "report":    Generate performance report with ROAS, CPA, and learnings
 * - "toggle":    Activate or deactivate specific campaigns/ad sets
 *
 * Content Creator Integration:
 * - When mode is "create" and no creative exists, the agent writes a brief
 *   to vault/clients/{client}/content-briefs/ and can trigger Content Creator
 *   via repository_dispatch to generate the ad creative.
 * - The brief includes pieceType "static-ad" | "headline-ad" | "collage-ad" | "reel"
 *   with ad-specific instructions (CTA, audience, placement context).
 */

/** @typedef {Object} MetaAdsBrief
 *
 * @property {string} client - Client slug (e.g. "dmancuello")
 * @property {string} source - Who triggered: "cli" | "consultant-agent" | "dashboard" | "github-actions"
 * @property {string} mode - "audit" | "create" | "optimize" | "report" | "toggle"
 *
 * --- Campaign context ---
 * @property {string} [campaignObjective] - "sales" | "traffic" | "leads" | "awareness" | "engagement"
 * @property {string} [campaignName] - Name for new campaign or target campaign for toggle/optimize
 * @property {string[]} [campaignIds] - Specific campaign IDs to act on (toggle/optimize)
 * @property {string} [toggleAction] - "activate" | "deactivate" (required when mode is "toggle")
 *
 * --- Budget ---
 * @property {number} [dailyBudget] - Daily budget in USD
 * @property {number} [totalBudget] - Total campaign budget in USD
 * @property {number} [roasTarget] - Target ROAS (e.g. 3.0 means $3 revenue per $1 spent)
 *
 * --- Targeting ---
 * @property {string} [targetAudience] - Audience description (e.g. "women 25-45 interested in leather goods")
 * @property {string[]} [targetCountries] - ISO country codes (e.g. ["UY", "CO", "PE"])
 * @property {string[]} [placements] - "feed" | "stories" | "reels" | "explore" | "audience-network"
 *
 * --- Creative ---
 * @property {string} [existingPieceId] - Content piece ID from content-library.md to use as ad creative
 * @property {boolean} [requestCreative] - If true and no existingPieceId, request Content Creator to generate
 * @property {string} [creativeType] - "static-ad" | "headline-ad" | "collage-ad" | "reel" (for Content Creator brief)
 *
 * --- Report ---
 * @property {number} [lookbackDays] - Days to analyze for report/audit (default: 7)
 *
 * --- Instructions ---
 * @property {string} [instructions] - Free-text instructions from Consultant Agent or owner
 */

export const DEFAULT_BRIEF = {
  client: "dmancuello",
  source: "cli",
  mode: "audit",
  campaignObjective: null,
  campaignName: null,
  campaignIds: null,
  toggleAction: null,
  dailyBudget: null,
  totalBudget: null,
  roasTarget: null,
  targetAudience: null,
  targetCountries: null,
  placements: null,
  existingPieceId: null,
  requestCreative: false,
  creativeType: null,
  lookbackDays: 7,
  instructions: null,
};

const VALID_MODES = ["audit", "create", "optimize", "report", "toggle"];
const VALID_OBJECTIVES = ["sales", "traffic", "leads", "awareness", "engagement"];
const VALID_TOGGLE_ACTIONS = ["activate", "deactivate"];
const VALID_CREATIVE_TYPES = ["static-ad", "headline-ad", "collage-ad", "reel"];
const VALID_PLACEMENTS = ["feed", "stories", "reels", "explore", "audience-network"];

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  if (!VALID_MODES.includes(brief.mode)) {
    throw new Error(`Invalid mode "${brief.mode}". Valid: ${VALID_MODES.join(", ")}`);
  }

  if (brief.campaignObjective && !VALID_OBJECTIVES.includes(brief.campaignObjective)) {
    throw new Error(`Invalid campaignObjective "${brief.campaignObjective}". Valid: ${VALID_OBJECTIVES.join(", ")}`);
  }

  if (brief.mode === "toggle") {
    if (!brief.toggleAction || !VALID_TOGGLE_ACTIONS.includes(brief.toggleAction)) {
      throw new Error(`Mode "toggle" requires toggleAction: ${VALID_TOGGLE_ACTIONS.join(", ")}`);
    }
    if (!brief.campaignIds && !brief.campaignName) {
      throw new Error('Mode "toggle" requires campaignIds or campaignName');
    }
  }

  if (brief.creativeType && !VALID_CREATIVE_TYPES.includes(brief.creativeType)) {
    throw new Error(`Invalid creativeType "${brief.creativeType}". Valid: ${VALID_CREATIVE_TYPES.join(", ")}`);
  }

  if (brief.placements) {
    for (const p of brief.placements) {
      if (!VALID_PLACEMENTS.includes(p)) {
        throw new Error(`Invalid placement "${p}". Valid: ${VALID_PLACEMENTS.join(", ")}`);
      }
    }
  }

  return brief;
}
