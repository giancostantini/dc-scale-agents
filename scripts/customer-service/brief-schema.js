/**
 * Customer Service Agent — Brief Schema
 *
 * Contract for how any source communicates with the Customer Service Agent.
 * Sources: Consultant Agent, Dashboard, CLI (manual), GitHub Actions (cron), Webhook (real-time)
 *
 * IMPORTANT ARCHITECTURAL DISTINCTION:
 * This agent talks TO END CUSTOMERS, not to the business owner.
 * It represents the client's brand directly (e.g. "Asistente de DMancuello").
 * Telegram notifications go to D&C Scale team for monitoring only.
 * The agentResponse field is what gets delivered to the customer.
 *
 * The Customer Service Agent handles:
 * - Real-time chat with end customers (web, WhatsApp, Instagram DM)
 * - Product recommendations with direct purchase links
 * - Guiding customers through the purchase process
 * - Detecting complaints and escalating when needed
 * - Generating FAQ documents from product catalogs
 * - Reporting on customer interaction patterns and satisfaction
 *
 * Modes:
 * - "chat":    Interactive conversation with an end customer (returns agentResponse)
 * - "faq":     Generate structured FAQ from product catalog
 * - "report":  Analyze customer interaction patterns and generate insights
 */

/** @typedef {Object} CustomerServiceBrief
 *
 * @property {string} client - Client slug (e.g. "dmancuello")
 * @property {string} source - Who triggered: "cli" | "consultant-agent" | "dashboard" | "github-actions" | "webhook"
 * @property {string} mode - "chat" | "faq" | "report"
 *
 * --- Chat context ---
 * @property {string|null} [customerMessage] - Incoming message from customer (REQUIRED for chat mode)
 * @property {string|null} [conversationId] - Session ID for conversation continuity
 * @property {object[]|null} [conversationHistory] - Previous messages: [{ role: "customer"|"agent", message: string, timestamp: ISO }]
 * @property {string|null} [customerName] - Customer name if known
 *
 * --- Channel ---
 * @property {string|null} [channel] - "whatsapp" | "web-chat" | "instagram-dm" | "email"
 *
 * --- Report ---
 * @property {number|null} [lookbackDays] - Days to analyze for report mode (default: 7)
 *
 * --- Limits ---
 * @property {number|null} [maxProducts] - Max products to recommend per response (default: 3)
 *
 * --- Instructions ---
 * @property {string|null} [instructions] - Free-text instructions from Consultant Agent
 */

export const DEFAULT_BRIEF = {
  client: "dmancuello",
  source: "cli",
  mode: "chat",
  customerMessage: null,
  conversationId: null,
  conversationHistory: null,
  customerName: null,
  channel: "web-chat",
  lookbackDays: 7,
  maxProducts: 3,
  instructions: null,
};

const VALID_MODES = ["chat", "faq", "report"];
const VALID_SOURCES = ["cli", "consultant-agent", "dashboard", "github-actions", "webhook"];
const VALID_CHANNELS = ["whatsapp", "web-chat", "instagram-dm", "email"];

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  if (!VALID_MODES.includes(brief.mode)) {
    throw new Error(`Invalid mode "${brief.mode}". Valid: ${VALID_MODES.join(", ")}`);
  }

  // Chat mode requires a customer message
  if (brief.mode === "chat") {
    if (!brief.customerMessage || typeof brief.customerMessage !== "string" || brief.customerMessage.trim() === "") {
      throw new Error('Mode "chat" requires a non-empty customerMessage');
    }
  }

  if (brief.channel && !VALID_CHANNELS.includes(brief.channel)) {
    throw new Error(`Invalid channel "${brief.channel}". Valid: ${VALID_CHANNELS.join(", ")}`);
  }

  // Validate conversation history structure if provided
  if (brief.conversationHistory) {
    if (!Array.isArray(brief.conversationHistory)) {
      throw new Error("conversationHistory must be an array");
    }
    for (const msg of brief.conversationHistory) {
      if (!msg.role || !["customer", "agent"].includes(msg.role)) {
        throw new Error('Each message in conversationHistory must have role "customer" or "agent"');
      }
      if (!msg.message || typeof msg.message !== "string") {
        throw new Error("Each message in conversationHistory must have a message string");
      }
    }
  }

  // Generate conversationId if not provided for chat mode
  if (brief.mode === "chat" && !brief.conversationId) {
    brief.conversationId = `${brief.client}-${Date.now()}`;
  }

  return brief;
}
