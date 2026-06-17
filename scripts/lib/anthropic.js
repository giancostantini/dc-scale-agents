/**
 * Cliente compartido de la Messages API de Claude para los agentes.
 *
 * Reemplaza las copias por-agente de `callClaude`. Suma, sin cambiar el
 * comportamiento del modelo:
 *   - retry con backoff exponencial (429/5xx/red)
 *   - prompt caching transparente: si pasás `system` (prefijo ESTABLE), se
 *     manda como bloque con cache_control ephemeral → Anthropic lo relee a
 *     ~0.1× dentro de ~5 min. Mismo contenido = mismo output, más barato.
 *   - registro de gasto en api_usage (si pasás `source`) — fire-and-forget.
 *
 * Devuelve { text, usage } (antes los agentes descartaban usage).
 */

import { recordApiUsage } from "./supabase.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_ATTEMPTS = 3;
const DEFAULT_MODEL = "claude-sonnet-4-6";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} prompt - tarea VOLÁTIL (va en el user message).
 * @param {Object} [opts]
 * @param {number} [opts.maxTokens=4096]
 * @param {string} [opts.model="claude-sonnet-4-6"]
 * @param {string} [opts.system] - prefijo ESTABLE (instrucciones + contexto de
 *   vault). Se cachea. Poné acá lo que se repite entre llamadas; dejá en
 *   `prompt` solo lo que cambia. (Opcional — si no lo pasás, todo va en prompt.)
 * @param {string} [opts.source] - 'agent:<slug>' para registrar el gasto.
 * @param {string|null} [opts.client] - slug del cliente (para el panel).
 * @param {Array} [opts.tools] - tools de la API (ej. web_search), opcional.
 * @returns {Promise<{ text: string, usage: Object }>}
 */
export async function callClaude(prompt, opts = {}) {
  const {
    maxTokens = 4096,
    model = DEFAULT_MODEL,
    system,
    source,
    client = null,
    tools,
  } = opts;

  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no configurada");
  }

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) {
    body.system = [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ];
  }
  if (tools) body.tools = tools;

  let res;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(
        `Claude API network error tras ${MAX_ATTEMPTS} intentos: ${err.message}`,
      );
    }
    if (res.ok) break;
    const errText = await res.text();
    const retriable = res.status === 429 || res.status >= 500;
    if (retriable && attempt < MAX_ATTEMPTS) {
      await sleep(1000 * 2 ** (attempt - 1));
      continue;
    }
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const usage = data.usage ?? {};

  if (source) {
    // No esperamos ni rompemos el agente si el registro falla.
    recordApiUsage({ source, client, model, usage }).catch(() => {});
  }

  // Concatenar todos los bloques de texto (algunos responses traen varios,
  // ej. cuando hay tool_use intercalado).
  const text = Array.isArray(data.content)
    ? data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
    : "";

  return { text, usage };
}
