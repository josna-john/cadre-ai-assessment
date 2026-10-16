import { asSchema, convertToModelMessages, isStepCount, smoothStream, streamText, type UIMessage } from "ai";
import { MODELS, costUsd, estimateStoppedTurn, model } from "./ai";
import { loadKnowledge } from "./knowledge";
import { LIMITS } from "./limits";
import { logEvent } from "./log";
import { chatTools } from "./tools";
import { buildSystemPrompt } from "@/prompts/system";

type Step = {
  usage: { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number } };
  providerMetadata?: unknown;
  toolCalls: { toolName: string }[];
};

// Tokens, cost and tool calls across all steps of a turn, for logs and evals.
// cachedInputTokens makes a silent loss of prompt caching (D7) visible in logs.
export function summarizeSteps(steps: readonly Step[]) {
  return {
    inputTokens: steps.reduce((n, s) => n + (s.usage.inputTokens ?? 0), 0),
    cachedInputTokens: steps.reduce((n, s) => n + (s.usage.inputTokenDetails?.cacheReadTokens ?? 0), 0),
    outputTokens: steps.reduce((n, s) => n + (s.usage.outputTokens ?? 0), 0),
    costUsd: steps.reduce((n, s) => n + (costUsd(s.providerMetadata) ?? 0), 0),
    tools: steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
  };
}

// Size of the tool definitions sent with every turn (constant per deploy).
let toolChars: number | undefined;
function toolDefinitionChars(): number {
  toolChars ??= JSON.stringify(
    Object.entries(chatTools).map(([name, t]) => ({
      name,
      description: t.description,
      schema: asSchema(t.inputSchema as Parameters<typeof asSchema>[0]).jsonSchema,
    })),
  ).length;
  return toolChars;
}

// One chat turn: prompt + capped history → streaming model call. Shared by the
// API route and the eval runner, so evals exercise the production path.
// Throws only if the history can't be converted (the caller maps that to a 400).
export async function streamChat(
  messages: UIMessage[],
  { abortSignal, startedAt = Date.now() }: { abortSignal?: AbortSignal; startedAt?: number } = {},
) {
  const modelMessages = await convertToModelMessages(messages, {
    // A turn stopped while show_action was in flight leaves a tool call with
    // no result. Without this, every later turn would fail.
    ignoreIncompleteToolCalls: true,
  });

  const base = { model: MODELS.chat, historyMessages: messages.length };
  const system = buildSystemPrompt(loadKnowledge());
  // Characters streamed so far, for estimating a stopped turn's cost.
  let replyChars = 0;

  return streamText({
    model: model("chat"),
    instructions: {
      role: "system",
      content: system,
      // The prompt (tools + rules + KB, about 6.9k tokens) is identical on
      // every turn, so mark it cacheable. Anthropic caches everything up to
      // this breakpoint; cache reads cost a tenth of normal input. See D7.
      providerOptions: { openrouter: { cacheControl: { type: "ephemeral" } } },
    },
    messages: modelMessages,
    tools: chatTools,
    // One step: the model writes its answer and calls show_action in the same
    // response, then the stream ends. With two steps, Haiku re-wrote the whole
    // answer after the tool result (duplicate text at double the cost). See D5.
    stopWhen: isStepCount(1),
    // The provider sends text in uneven bursts. Re-chunk it into single words
    // at a steady pace so the reply reads as it types instead of jumping.
    experimental_transform: smoothStream({ chunking: "word", delayInMs: 12 }),
    maxOutputTokens: LIMITS.maxOutputTokens,
    timeout: { totalMs: LIMITS.requestTimeoutMs },
    abortSignal,
    onEnd: (event) => {
      logEvent("chat.turn", {
        ...base,
        latencyMs: Date.now() - startedAt,
        finishReason: event.finishReason,
        ...summarizeSteps(event.steps),
      });
    },
    onChunk: ({ chunk }) => {
      if (chunk.type === "text-delta") replyChars += chunk.text.length;
      else if (chunk.type === "tool-input-delta") replyChars += chunk.delta.length;
    },
    // onEnd doesn't fire on abort (user pressed Stop or New chat, or the
    // timeout fired), but those turns are still billed. With one step (D5) a
    // stopped turn has no completed step, so no usage report and a reported
    // cost of 0. Log an upper-bound estimate instead, labelled as such
    // (OpenRouter's per-generation lookup returns "not found" on this account).
    onAbort: (event) => {
      const reported = summarizeSteps(event.steps);
      const estimate = event.steps.length
        ? undefined
        : estimateStoppedTurn({
            promptChars: system.length + toolDefinitionChars() + JSON.stringify(modelMessages).length,
            replyChars,
          });
      logEvent("chat.aborted", {
        ...base,
        latencyMs: Date.now() - startedAt,
        reason: String(event.reason ?? "aborted"),
        ...reported,
        ...estimate,
        costSource: estimate ? "estimate_upper_bound" : "openrouter",
        replyChars,
      });
    },
  });
}
