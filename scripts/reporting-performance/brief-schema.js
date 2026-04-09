/**
 * Reporting Performance Agent — Brief Schema
 *
 * Contract for how any source communicates with the Reporting Performance Agent.
 * Sources: Consultant Agent, Dashboard, CLI (manual), GitHub Actions (cron)
 *
 * The Reporting Performance Agent handles:
 * - Calculating business KPIs (CAC, LTV, ROAS, margins, growth rates)
 * - Analyzing market position and competitive landscape
 * - Generating comprehensive performance reports with action items
 * - Adapting analysis based on business type (ecommerce, services, SaaS, etc.)
 * - Tracking trends and providing health scores
 * - Producing channel-level breakdowns and ROI analysis
 *
 * Modes:
 * - "metrics":  Calculate and analyze key business KPIs for the period
 * - "market":   Competitive analysis, SWOT, industry benchmarks
 * - "report":   Full performance report with executive summary and action items
 *
 * Business Type Adaptation:
 * - ecommerce:       AOV, cart abandonment, ROAS, conversion rate
 * - services:        Client acquisition cost, retention, LTV, project margins
 * - physical-retail: Foot traffic, ticket size, inventory turns, same-store growth
 * - saas:            MRR, churn, ARR, expansion revenue, payback period
 * - it-services:     Project margins, utilization rate, delivery time, backlog
 */

/** @typedef {Object} PerformanceBrief
 *
 * @property {string} client - Client slug (e.g. "dmancuello")
 * @property {string} source - Who triggered: "cli" | "consultant-agent" | "dashboard" | "github-actions"
 * @property {string} mode - "metrics" | "market" | "report"
 *
 * --- Business context ---
 * @property {string|null} [businessType] - "ecommerce" | "services" | "physical-retail" | "saas" | "it-services"
 * @property {number|null} [lookbackDays] - Days to analyze (defaults: metrics=7, market/report=30)
 *
 * --- Focus areas ---
 * @property {string[]|null} [focusAreas] - "cac" | "ltv" | "roas" | "conversion" | "margin" | "retention" | "growth"
 *
 * --- Competitive context ---
 * @property {string[]|null} [competitors] - Competitor names or URLs for market analysis
 *
 * --- Revenue data ---
 * @property {object|null} [revenueData] - { totalRevenue, adSpend, cogs, operatingCosts }
 *
 * --- Instructions ---
 * @property {string|null} [instructions] - Free-text instructions from Consultant Agent or owner
 */

export const DEFAULT_BRIEF = {
  client: "dmancuello",
  source: "cli",
  mode: "metrics",
  businessType: null,
  lookbackDays: null,
  focusAreas: null,
  competitors: null,
  revenueData: null,
  instructions: null,
};

const VALID_MODES = ["metrics", "market", "report"];
const VALID_BUSINESS_TYPES = ["ecommerce", "services", "physical-retail", "saas", "it-services"];
const VALID_FOCUS_AREAS = ["cac", "ltv", "roas", "conversion", "margin", "retention", "growth"];

/** Default lookback days per mode */
const DEFAULT_LOOKBACK = {
  metrics: 7,
  market: 30,
  report: 30,
};

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  if (!VALID_MODES.includes(brief.mode)) {
    throw new Error(`Invalid mode "${brief.mode}". Valid: ${VALID_MODES.join(", ")}`);
  }

  if (brief.businessType && !VALID_BUSINESS_TYPES.includes(brief.businessType)) {
    throw new Error(`Invalid businessType "${brief.businessType}". Valid: ${VALID_BUSINESS_TYPES.join(", ")}`);
  }

  if (brief.focusAreas) {
    for (const area of brief.focusAreas) {
      if (!VALID_FOCUS_AREAS.includes(area)) {
        throw new Error(`Invalid focusArea "${area}". Valid: ${VALID_FOCUS_AREAS.join(", ")}`);
      }
    }
  }

  // Apply default lookback if not specified
  if (brief.lookbackDays === null || brief.lookbackDays === undefined) {
    brief.lookbackDays = DEFAULT_LOOKBACK[brief.mode];
  }

  return brief;
}
