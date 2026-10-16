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
  return openrouter(MODELS[key], {
    // usage.include asks OpenRouter to return the real dollar cost of each call,
    // so logs record spend instead of an estimate from token counts.
    usage: { include: true },
    // Haiku 5.5 reasons by default, and hidden reasoning counts against
    // maxOutputTokens. On the data-security question it used 421 of 600 tokens
    // thinking, so the reply hit the cap before its tool call. Grounded lookup
    // from a fixed KB doesn't need it; the eval set is the check. See D9.
    extraBody: { reasoning: { enabled: false } },
  });
}

// Per-token USD prices for MODELS.chat, from OpenRouter's /api/v1/models
// (2026-10-16). Only used to estimate stopped turns, which never receive a
// usage report. Update together with MODELS.chat.
export const CHAT_PRICING = { input: 1e-7, cacheWrite: 1.25e-7, cacheRead: 1e-8, output: 5e-7 } as const;

// Characters per token, calibrated against a real turn: the markdown- and
// JSON-heavy prompt is ~2.7 chars/token (6,874 tokens for ~18.7k chars);
// plain reply text is ~4.
const PROMPT_CHARS_PER_TOKEN = 2.7;
const REPLY_CHARS_PER_TOKEN = 4;

// What a stopped turn probably cost. A stopped stream never gets the final
// usage chunk, so its reported cost is 0 even though the input and the tokens
// generated so far are billed. This is an upper bound: it prices the input as
// a cache write (the most expensive case), since whether the cache was warm is
// unknown. It's meant for budget tracking, so it errs high.
export function estimateStoppedTurn({ promptChars, replyChars }: { promptChars: number; replyChars: number }) {
  const inputTokens = Math.ceil(promptChars / PROMPT_CHARS_PER_TOKEN);
  const outputTokens = Math.ceil(replyChars / REPLY_CHARS_PER_TOKEN);
  const costUsd = inputTokens * CHAT_PRICING.cacheWrite + outputTokens * CHAT_PRICING.output;
  return { inputTokens, outputTokens, costUsd };
}

// Dollar cost reported by OpenRouter for a call, if present.
export function costUsd(providerMetadata: unknown): number | undefined {
  const cost = (providerMetadata as { openrouter?: { usage?: { cost?: unknown } } })
    ?.openrouter?.usage?.cost;
  return typeof cost === "number" ? cost : undefined;
}
