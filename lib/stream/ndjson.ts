/**
 * Client-side reader for newline-delimited JSON streams. Yields one parsed
 * object per line; malformed lines are skipped rather than crashing the stream.
 */
export async function* readNdjson<T extends { type: string }>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parse = (line: string): T | null => {
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === "object" && value !== null && "type" in value) return value as T;
    } catch {
      // ignore
    }
    return null;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = parse(line);
        if (event) yield event;
      }
    }
    const tail = buffer.trim();
    if (tail) {
      const event = parse(tail);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Reads a JSON error body from a non-OK response, with a safe fallback. */
export async function readErrorBody(
  response: Response,
): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } };
    if (typeof body.error?.code === "string" && typeof body.error.message === "string") {
      return { code: body.error.code, message: body.error.message };
    }
  } catch {
    // fall through
  }
  return { code: "upstream_error", message: `Request failed with status ${response.status}.` };
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
