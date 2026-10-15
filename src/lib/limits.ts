// Hard caps that protect the fixed OpenRouter budget and keep latency
// predictable. Shared by the API route (enforcement) and the UI (feedback).
export const LIMITS = {
  // Longest single user message, in characters.
  maxInputChars: 1000,
  // Only the most recent messages are sent to the model...
  maxHistoryMessages: 20,
  // ...and only as many as fit in this size (serialized characters). The
  // client controls the history it sends, so this caps input tokens per
  // request even against a scripted, oversized history.
  maxHistoryChars: 16_000,
  // Cap on the model's reply length per turn.
  maxOutputTokens: 600,
  // Abort the model call if it runs longer than this.
  requestTimeoutMs: 30_000,
} as const;
