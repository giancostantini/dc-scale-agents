/**
 * SEO Agent — Brief Schema
 *
 * Contract for how any source communicates with the SEO Agent.
 * Sources: Consultant Agent, Dashboard (business owner), Strategy Agent, CLI (manual)
 *
 * The brief can arrive as:
 * - CLI: node index.js --brief path/to/brief.json
 * - CLI shorthand: node index.js <client> <pieceType> (minimal brief, uses defaults)
 * - API (future): POST /api/seo with JSON body
 * - Consultant Agent (future): calls createSEOPiece(brief) directly
 */

/**
 * @typedef {Object} SEOBrief
 *
 * @property {string} client - Client slug (e.g. "dmancuello")
 * @property {string} pieceType - "blog-post" | "keyword-research" | "product-meta" | "category-meta" | "content-brief"
 * @property {string} source - Who triggered this: "cli" | "consultant-agent" | "dashboard" | "strategy-agent"
 *
 * --- SEO direction (optional, progressively filled by Consultant Agent) ---
 * @property {string} [targetKeyword] - Primary keyword to target
 * @property {string[]} [secondaryKeywords] - Supporting keywords
 * @property {string} [searchIntent] - "informational" | "transactional" | "navigational" | "commercial"
 * @property {string} [articleFormat] - "guia-definitiva" | "listicle" | "how-to" | null (let agent decide)
 * @property {string} [topic] - Specific topic or angle for the content
 * @property {string} [targetAudience] - Who this content is for
 * @property {string} [tone] - Tone override (e.g. "experto", "cercano", "tecnico")
 * @property {string} [productSlug] - For product-meta, which product to optimize
 * @property {string} [categorySlug] - For category-meta, which category to optimize
 * @property {string} [instructions] - Free-text instructions
 */

/** Default brief */
export const DEFAULT_BRIEF = {
  client: "dmancuello",
  pieceType: "blog-post",
  source: "cli",
  targetKeyword: null,
  secondaryKeywords: [],
  searchIntent: null,
  articleFormat: null,
  topic: null,
  targetAudience: null,
  tone: null,
  productSlug: null,
  categorySlug: null,
  instructions: null,
};

/** Validates a brief and fills missing fields with defaults */
export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string") {
    throw new Error("Brief must include a valid 'client' slug");
  }

  const validTypes = [
    "blog-post",
    "keyword-research",
    "product-meta",
    "category-meta",
    "content-brief",
  ];
  if (!validTypes.includes(brief.pieceType)) {
    throw new Error(
      `Invalid pieceType "${brief.pieceType}". Valid: ${validTypes.join(", ")}`
    );
  }

  return brief;
}
