/**
 * Cliente SSE para /api/consultant/global. Parsea el stream de eventos
 * y los entrega via callbacks.
 *
 * El endpoint emite eventos JSON one-per-line precedidos por `data: ` y
 * separados por línea en blanco (formato SSE estándar). Tipos:
 *   - meta:        { type, conversationId }
 *   - delta:       { type, text }
 *   - tool_use:    { type, name, input }
 *   - tool_result: { type, name, ok, detail }
 *   - done:        { type, model, usage }
 *   - error:       { type, message }
 */

export interface StreamCallbacks {
  onMeta?: (conversationId: string) => void;
  onDelta?: (text: string) => void;
  onToolUse?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (
    name: string,
    ok: boolean,
    detail: Record<string, unknown>,
  ) => void;
  onDone?: (model: string, usage: Record<string, unknown>) => void;
  onError?: (message: string) => void;
}

export interface StreamMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface StreamRequest {
  messages: StreamMessageInput[];
  activeClient?: string | null;
  accessToken: string;
  signal?: AbortSignal;
}

/**
 * Manda los mensajes al endpoint y consume el SSE. Resuelve cuando termina
 * el stream (done o error). Si el callee aborta vía `signal`, lanza
 * `AbortError`.
 */
export async function streamChat(
  req: StreamRequest,
  cb: StreamCallbacks,
): Promise<void> {
  const res = await fetch("/api/consultant/global", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${req.accessToken}`,
    },
    body: JSON.stringify({
      messages: req.messages,
      activeClient: req.activeClient ?? null,
    }),
    signal: req.signal,
  });

  if (!res.ok || !res.body) {
    // El endpoint devuelve JSON error si falla antes de iniciar el stream
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      // Body no era JSON parseable — quedó el HTTP code
    }
    cb.onError?.(msg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE: eventos separados por línea en blanco (\n\n)
    let separatorIdx;
    while ((separatorIdx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, separatorIdx);
      buffer = buffer.slice(separatorIdx + 2);

      // Cada evento puede tener varias líneas `data: ...`
      for (const line of rawEvent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }

        switch (event.type) {
          case "meta":
            cb.onMeta?.(event.conversationId as string);
            break;
          case "delta":
            cb.onDelta?.(event.text as string);
            break;
          case "tool_use":
            cb.onToolUse?.(
              event.name as string,
              (event.input as Record<string, unknown>) ?? {},
            );
            break;
          case "tool_result":
            cb.onToolResult?.(
              event.name as string,
              Boolean(event.ok),
              (event.detail as Record<string, unknown>) ?? {},
            );
            break;
          case "done":
            cb.onDone?.(
              event.model as string,
              (event.usage as Record<string, unknown>) ?? {},
            );
            return;
          case "error":
            cb.onError?.(event.message as string);
            return;
        }
      }
    }
  }
}
