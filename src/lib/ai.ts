import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Central model config. Every LLM call goes through OpenRouter, so swapping
// model or vendor (Anthropic <-> OpenAI <-> Google) is a one-line change to
// the IDs below rather than a refactor.
export const MODELS = {
  // The chatbot. Haiku is fast and cheap enough for a public support bot on a
  // fixed budget, and follows grounding/escalation rules well. Revisit if the
  // eval set shows quality gaps (Sonnet is the next step up).
  chat: "anthropic/claude-haiku-5.5",
  // Health check and other trivial calls.
  fast: "anthropic/claude-haiku-5.5",
} as const;

export type ModelKey = keyof typeof MODELS;

// Reads OPENROUTER_API_KEY from the environment.
const openrouter = createOpenRouter();

export function model(key: ModelKey) {
  // usage.include asks OpenRouter to return the real dollar cost of each call,
  // so logs record spend instead of an estimate from token counts.
  return openrouter(MODELS[key], { usage: { include: true } });
}

// Dollar cost reported by OpenRouter for a call, if present.
export function costUsd(providerMetadata: unknown): number | undefined {
  const cost = (providerMetadata as { openrouter?: { usage?: { cost?: unknown } } })
    ?.openrouter?.usage?.cost;
  return typeof cost === "number" ? cost : undefined;
}
