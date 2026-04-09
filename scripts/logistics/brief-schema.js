/**
 * Logistics Agent — Brief Schema
 *
 * Contract for how any source communicates with the Logistics Agent.
 * Sources: Consultant Agent, Dashboard, CLI (manual), GitHub Actions (cron)
 *
 * The Logistics Agent handles:
 * - Scheduling upcoming shipments based on pending orders and stock availability
 * - Dispatching orders: confirming shipments, generating carrier notifications
 * - Logistics optimization: analyzing delivery performance, costs, and bottlenecks
 * - Performance reports: KPIs, carrier comparison, cost-per-order trends
 * - Triggering the Stock Agent post-dispatch to update inventory levels
 *
 * Modes:
 * - "schedule":  Plan upcoming shipments — assign dates, carriers, priorities
 * - "dispatch":  Execute shipments — confirm orders, notify carriers, update stock
 * - "optimize":  Analyze logistics performance and recommend improvements
 * - "report":    Generate logistics performance report with KPIs and learnings
 *
 * Stock Agent Integration:
 * - When mode is "dispatch" and triggerStockCheck is true, the agent triggers
 *   the Stock Agent via repository_dispatch after dispatching orders.
 * - The Stock Agent receives an alert brief with source "logistics-agent"
 *   to reconcile inventory levels post-shipment.
 */

/** @typedef {Object} LogisticsBrief
 *
 * @property {string} client - Client slug (e.g. "dmancuello")
 * @property {string} source - Who triggered: "cli" | "consultant-agent" | "dashboard" | "github-actions"
 * @property {string} mode - "schedule" | "dispatch" | "optimize" | "report"
 *
 * --- Order context ---
 * @property {object[]|null} [orders] - Orders to schedule or dispatch
 *   Each order: { orderId: string, products: [{ sku: string, quantity: number }], destination: string, priority: string }
 *
 * --- Shipping ---
 * @property {string|null} [shippingCompany] - Preferred carrier (e.g. "oca", "dac", "correo-uruguayo")
 *
 * --- Date range ---
 * @property {object|null} [dateRange] - Period for schedule/optimize/report
 *   Format: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 *
 * --- Lookback ---
 * @property {number|null} [lookbackDays] - Days to analyze. Defaults: schedule=7, optimize=7, report=30
 *
 * --- Stock Agent integration ---
 * @property {boolean} [triggerStockCheck] - If true, trigger Stock Agent after dispatch (default false)
 *
 * --- Instructions ---
 * @property {string|null} [instructions] - Free-text instructions from Consultant Agent or owner
 */

export const DEFAULT_BRIEF = {
  client: "dmancuello",
  source: "cli",
  mode: "schedule",
  orders: null,
  shippingCompany: null,
  dateRange: null,
  lookbackDays: null,
  triggerStockCheck: false,
  instructions: null,
};

const VALID_MODES = ["schedule", "dispatch", "optimize", "report"];
const VALID_SOURCES = ["cli", "consultant-agent", "dashboard", "github-actions"];
const VALID_PRIORITIES = ["urgent", "normal", "low"];
const DEFAULT_LOOKBACK = { schedule: 7, optimize: 7, report: 30 };

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  if (!VALID_MODES.includes(brief.mode)) {
    throw new Error(`Invalid mode "${brief.mode}". Valid: ${VALID_MODES.join(", ")}`);
  }

  // Dispatch mode requires orders or instructions
  if (brief.mode === "dispatch") {
    if ((!brief.orders || brief.orders.length === 0) && !brief.instructions) {
      throw new Error('Mode "dispatch" requires orders array or instructions');
    }
  }

  // Validate orders structure if provided
  if (brief.orders && Array.isArray(brief.orders)) {
    for (const order of brief.orders) {
      if (!order.orderId) {
        throw new Error("Each order must include an orderId");
      }
      if (!order.products || !Array.isArray(order.products) || order.products.length === 0) {
        throw new Error(`Order "${order.orderId}" must include a products array`);
      }
      for (const product of order.products) {
        if (!product.sku || typeof product.quantity !== "number") {
          throw new Error(`Products in order "${order.orderId}" must have sku (string) and quantity (number)`);
        }
      }
      if (order.priority && !VALID_PRIORITIES.includes(order.priority)) {
        throw new Error(`Invalid priority "${order.priority}" in order "${order.orderId}". Valid: ${VALID_PRIORITIES.join(", ")}`);
      }
    }
  }

  // Validate dateRange structure if provided
  if (brief.dateRange) {
    if (!brief.dateRange.start || !brief.dateRange.end) {
      throw new Error('dateRange must include "start" and "end" in YYYY-MM-DD format');
    }
  }

  // Apply default lookbackDays based on mode
  if (brief.lookbackDays === null || brief.lookbackDays === undefined) {
    brief.lookbackDays = DEFAULT_LOOKBACK[brief.mode] || 7;
  }

  return brief;
}
