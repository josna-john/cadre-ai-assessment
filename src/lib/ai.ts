// Central model config. Every LLM call goes through Vercel AI Gateway using
// "provider/model" strings, so swapping providers (Anthropic <-> OpenAI, etc.)
// is a one-line change here rather than a refactor.
export const MODELS = {
  // Default for most tasks: good quality/cost balance.
  default: "anthropic/claude-sonnet-5.5",
  // Hard multi-step reasoning, used sparingly.
  smart: "anthropic/claude-opus-5.5",
  // Cheap and fast: classification, extraction, smoke tests.
  fast: "anthropic/claude-haiku-5.5",
} as const;

export type ModelKey = keyof typeof MODELS;
