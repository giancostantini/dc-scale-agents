/**
 * Analytics Agent (Reporting Performance) — Brief Schema
 *
 * Sources: Consultant Agent, Dashboard, CLI (manual), GitHub Actions (cron)
 *
 * The Analytics Agent handles:
 * - Automated periodic reports (daily, weekly, biweekly, monthly)
 * - Prioritized improvement insights with $ impact estimates
 * - Custom on-demand reports (channel deep dive, cohorts, funnel, LTV/CAC, forecast)
 * - Natural language queries (for dashboard chat integration)
 *
 * Modes:
 * - "daily":    Daily pulse report (today vs yesterday, conversions, spend, narrative)
 * - "weekly":   Weekly performance report with week-over-week comparison
 * - "biweekly": Biweekly report with trend analysis
 * - "monthly":  Full client-facing monthly report
 * - "insights": Prioritized improvement inputs (ALTA/MEDIA/OPORTUNIDAD) with $ impact
 * - "custom":   Ad-hoc report with specific parameters (channel, product, period, cohort)
 * - "query":    Natural language question → direct textual answer
 *
 * Business Type Adaptation (KPI focus):
 * - ecommerce:       Revenue, AOV, cart abandonment, ROAS, conversion, LTV/CAC (default)
 * - services:        CAC, LTV, retention, project margins, recurring revenue
 * - physical-retail: Ticket size, foot traffic, sales/m2, inventory turns
 * - saas:            MRR, ARR, churn, expansion revenue, payback period, NRR
 * - it-services:     Project margins, utilization rate, delivery time, backlog
 */

/** @typedef {Object} AnalyticsBrief
 *
 * @property {string} client - Client slug (e.g. "<client-slug>") — required, no defaults
 * @property {string} source - "cli" | "consultant-agent" | "dashboard" | "github-actions"
 * @property {string} mode - "daily" | "weekly" | "biweekly" | "monthly" | "insights" | "custom" | "query"
 *
 * --- Business context ---
 * @property {string|null} [businessType] - "ecommerce" | "services" | "physical-retail" | "saas" | "it-services"
 * @property {number|null} [lookbackDays] - Days to analyze (defaults per mode)
 *
 * --- Custom mode ---
 * @property {string|null} [customReportType] - "channel-deep-dive" | "cohort-analysis" | "funnel" | "ltv-cac" | "forecast" | "free-form"
 * @property {object|null} [customFilters] - { channel, product, dateRange, cohort, etc. }
 *
 * --- Query mode ---
 * @property {string|null} [question] - Natural language question for "query" mode
 *
 * --- Focus areas (filters the narrative) ---
 * @property {string[]|null} [focusAreas] - Subset of KPIs to emphasize
 *   Values: "revenue" | "cac" | "ltv" | "roas" | "conversion" | "abandonment" | "traffic" | "retention" | "margin" | "growth"
 *
 * --- Input data (for Phase 1 simulation) ---
 * @property {object|null} [revenueData] - Manually provided data: { totalRevenue, adSpend, orders, sessions, etc. }
 *
 * --- Instructions ---
 * @property {string|null} [instructions] - Free-text instructions from Consultant Agent or owner
 */

export const DEFAULT_BRIEF = {
  client: null, // required at call-site — no default client
  source: "cli",
  mode: "weekly",
  businessType: "ecommerce",
  lookbackDays: null,
  customReportType: null,
  customFilters: null,
  question: null,
  focusAreas: null,
  revenueData: null,
  instructions: null,
};

const VALID_MODES = ["daily", "weekly", "biweekly", "monthly", "insights", "custom", "query"];
const VALID_BUSINESS_TYPES = ["ecommerce", "services", "physical-retail", "saas", "it-services"];
const VALID_FOCUS_AREAS = [
  "revenue",
  "cac",
  "ltv",
  "roas",
  "conversion",
  "abandonment",
  "traffic",
  "retention",
  "margin",
  "growth",
];
const VALID_CUSTOM_TYPES = [
  "channel-deep-dive",
  "cohort-analysis",
  "funnel",
  "ltv-cac",
  "forecast",
  "free-form",
];

/** Default lookback days per mode */
const DEFAULT_LOOKBACK = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  insights: 30,
  custom: 30,
  query: 30,
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
    throw new Error(
      `Invalid businessType "${brief.businessType}". Valid: ${VALID_BUSINESS_TYPES.join(", ")}`
    );
  }

  if (brief.focusAreas) {
    for (const area of brief.focusAreas) {
      if (!VALID_FOCUS_AREAS.includes(area)) {
        throw new Error(
          `Invalid focusArea "${area}". Valid: ${VALID_FOCUS_AREAS.join(", ")}`
        );
      }
    }
  }

  if (brief.mode === "custom" && brief.customReportType && !VALID_CUSTOM_TYPES.includes(brief.customReportType)) {
    throw new Error(
      `Invalid customReportType "${brief.customReportType}". Valid: ${VALID_CUSTOM_TYPES.join(", ")}`
    );
  }

  if (brief.mode === "query" && !brief.question) {
    throw new Error('Mode "query" requires a "question" field');
  }

  // Apply default lookback if not specified
  if (brief.lookbackDays === null || brief.lookbackDays === undefined) {
    brief.lookbackDays = DEFAULT_LOOKBACK[brief.mode];
  }

  return brief;
}
