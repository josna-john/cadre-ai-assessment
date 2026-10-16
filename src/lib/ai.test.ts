import { describe, expect, it } from "vitest";
import { CHAT_PRICING, costUsd, estimateStoppedTurn } from "./ai";

describe("costUsd", () => {
  it("reads OpenRouter's reported cost, and nothing else", () => {
    expect(costUsd({ openrouter: { usage: { cost: 0.00023 } } })).toBe(0.00023);
    expect(costUsd({ openrouter: { usage: {} } })).toBeUndefined();
    expect(costUsd(undefined)).toBeUndefined();
  });
});

describe("estimateStoppedTurn", () => {
  it("prices a stopped turn as an upper bound: input as a cache write, plus the reply so far", () => {
    // ~18.7k chars of prompt is ~6.9k tokens, matching a real turn's 6,874.
    const e = estimateStoppedTurn({ promptChars: 18_746, replyChars: 400 });
    expect(e.inputTokens).toBe(6943);
    expect(e.outputTokens).toBe(100);
    expect(e.costUsd).toBeCloseTo(6943 * CHAT_PRICING.cacheWrite + 100 * CHAT_PRICING.output, 12);
  });

  it("is never zero once a prompt was sent, even if nothing streamed back", () => {
    expect(estimateStoppedTurn({ promptChars: 18_000, replyChars: 0 }).costUsd).toBeGreaterThan(0);
  });

  it("stays above what a cached turn really costs, so budgets err high", () => {
    // A real completed turn: 6,874 input (6,782 cached), 311 output, billed $0.00023192.
    const billed = 0.00023192;
    expect(estimateStoppedTurn({ promptChars: 18_746, replyChars: 311 * 4 }).costUsd).toBeGreaterThan(billed);
  });
});
