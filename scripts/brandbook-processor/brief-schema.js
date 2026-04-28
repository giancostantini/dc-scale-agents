/**
 * Brandbook Processor — Brief Schema
 *
 * Recibe el texto crudo del brandbook de un cliente (extraído de un PDF, una
 * presentación, o pegado a mano) y lo divide en 8 archivos estructurados
 * que viven en `vault/clients/<slug>/brand/`.
 *
 * Sources de invocación:
 *   - dashboard      → al crear cliente nuevo en el wizard
 *   - dashboard      → al re-procesar brandbook desde la pantalla del cliente
 *   - cli            → ejecución manual con --brief
 */

/** @typedef {Object} BrandbookBrief
 *
 * @property {string} client          - slug del cliente (e.g. "wiztrip")
 * @property {string} brandbookText   - texto completo del brandbook (mín 200 chars)
 * @property {string|null} [brandbookUrl] - link opcional al PDF master (Drive/Dropbox)
 * @property {string} source          - "dashboard" | "cli"
 * @property {boolean} [reprocess]    - true si es re-proceso (sobrescribe + archiva versión vieja)
 */

export const DEFAULT_BRIEF = {
  client: null,
  brandbookText: null,
  brandbookUrl: null,
  source: "cli",
  reprocess: false,
};

export function parseBrief(input) {
  const brief = { ...DEFAULT_BRIEF, ...input };

  if (!brief.client || typeof brief.client !== "string" || !brief.client.trim()) {
    throw new Error("Brief must include a valid 'client' slug");
  }
  if (!brief.brandbookText || typeof brief.brandbookText !== "string") {
    throw new Error("Brief must include 'brandbookText' (string)");
  }
  if (brief.brandbookText.length < 200) {
    throw new Error(
      `'brandbookText' too short (${brief.brandbookText.length} chars). Mínimo 200 — pegá el brandbook completo.`,
    );
  }

  return brief;
}
