/**
 * Stock Agent — Brief Schema
 *
 * Contract for how any source communicates with the Stock Agent.
 * Sources: Consultant Agent, Dashboard, CLI (manual), GitHub Actions (cron)
 *
 * The Stock Agent handles:
 * - Tracking current inventory levels per product/SKU
 * - Calculating sales velocity from historical sales data
 * - Computing reorder points based on lead time + safety stock
 * - Generating stockout forecasts and reorder recommendations
 * - Alerting when products fall below safety thresholds
 * - Producing weekly stock health reports with KPIs and trends
 *
 * Modes:
 * - "status":    Current inventory snapshot — stock levels, daily sales rate, days remaining per SKU
 * - "forecast":  Predict stockout dates and generate reorder schedule with quantities
 * - "alert":     Urgent check — only surfaces products below threshold (critical/warning)
 * - "report":    Weekly stock health report with KPIs, trends, and recommendations
 *
 * Integration:
 * - Reads stock-log.md and sales-log.md from the client vault
 * - Writes updated stock analysis back to stock-log.md
 * - Feeds learnings into learning-log.md for cross-agent intelligence
 * - Consultant Agent orchestrates: triggers Stock Agent, receives results,
 *   and decides whether to notify the owner or take action
 */

/** @typedef {Object} StockBrief
 *
 * @property {string} client - Client slug (e.g. "<client-slug>") — required, no defaults
 * @property {string} source - Who triggered: "cli" | "consultant-agent" | "dashboard" | "github-actions"
 * @property {string} mode - "status" | "forecast" | "alert" | "report"
 *
 * --- Filters ---
 * @property {string[]|null} [products] - Filter by SKUs (null = all products)
 *
 * --- Inventory parameters ---
 * @property {number|null} [supplierLeadTimeDays] - Override default supplier lead time in days
 * @property {number|null} [safetyStockDays] - Buffer stock days (default: 3)
 * @property {number|null} [lookbackDays] - Sales history window in days (default: 30)
 *
 * --- Alert configuration ---
 * @property {string|null} [alertThreshold] - "critical" | "warning" | "all" (default: "all")
 *
 * --- Instructions ---
 * @property {string|null} [instructions] - Free-text instructions from Consultant Agent or owner
 */

export const DEFAULT_BRIEF = {
  client: null, // required at call-site — no default client
  source: "cli",
  mode: "status",
  products: null,
  supplierLeadTimeDays: null,
  safetyStockDays: 3,
  lookbackDays: 30,
  alertThreshold: "all",
  instructions: null,
};

const VALID_MODES = ["status", "forecast", "alert", "report"];
const VALID_ALERT_THRESHOLDS = ["critical", "warning", "all"];

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  if (!VALID_MODES.includes(brief.mode)) {
    throw new Error(`Invalid mode "${brief.mode}". Valid: ${VALID_MODES.join(", ")}`);
  }

  if (brief.alertThreshold && !VALID_ALERT_THRESHOLDS.includes(brief.alertThreshold)) {
    throw new Error(`Invalid alertThreshold "${brief.alertThreshold}". Valid: ${VALID_ALERT_THRESHOLDS.join(", ")}`);
  }

  if (brief.products !== null) {
    if (!Array.isArray(brief.products) || brief.products.length === 0) {
      throw new Error("'products' must be a non-empty array of SKU strings or null");
    }
    for (const sku of brief.products) {
      if (typeof sku !== "string" || sku.trim() === "") {
        throw new Error(`Invalid SKU in products array: "${sku}". Must be a non-empty string`);
      }
    }
  }

  if (brief.supplierLeadTimeDays !== null && (typeof brief.supplierLeadTimeDays !== "number" || brief.supplierLeadTimeDays < 0)) {
    throw new Error("'supplierLeadTimeDays' must be a positive number or null");
  }

  if (brief.safetyStockDays !== null && (typeof brief.safetyStockDays !== "number" || brief.safetyStockDays < 0)) {
    throw new Error("'safetyStockDays' must be a positive number or null");
  }

  if (brief.lookbackDays !== null && (typeof brief.lookbackDays !== "number" || brief.lookbackDays < 1)) {
    throw new Error("'lookbackDays' must be a positive number >= 1 or null");
  }

  return brief;
}
