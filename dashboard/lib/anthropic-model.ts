/**
 * Modelo de Anthropic centralizado.
 *
 * Single source of truth para no quedar con identifiers desactualizados
 * desparramados por todas las routes de la API.
 *
 * Override por env var: setear ANTHROPIC_MODEL en .env (sin prefix
 * NEXT_PUBLIC_, porque solo se usa server-side) para cambiar de modelo
 * sin tocar código.
 *
 * Defaults seguros:
 *  - CLAUDE_MODEL_OPUS:   reportes pesados (estrategia, diagnóstico,
 *                         consultor del director, etc).
 *  - CLAUDE_MODEL_SONNET: chats livianos (asistente del cliente).
 *  - CLAUDE_MODEL_HAIKU:  tareas baratas de fondo (destilar aprendizajes,
 *                         resúmenes incrementales). El más barato.
 *
 * Ojo: si Anthropic deprecó un modelo, la API tira 404. Lo agarramos
 * en cada route con try/catch y devolvemos el mensaje al director.
 */

export const CLAUDE_MODEL_OPUS =
  process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";

export const CLAUDE_MODEL_SONNET =
  process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-6";

export const CLAUDE_MODEL_HAIKU =
  process.env.ANTHROPIC_MODEL_HAIKU ?? "claude-haiku-4-5";
