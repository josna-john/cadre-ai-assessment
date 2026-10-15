import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { MODELS, costUsd, model } from "./ai";
import { loadKnowledge } from "./knowledge";
import { LIMITS } from "./limits";
import { logEvent } from "./log";
import { chatTools } from "./tools";
import { buildSystemPrompt } from "@/prompts/system";

type Step = { usage: { inputTokens?: number; outputTokens?: number }; providerMetadata?: unknown; toolCalls: { toolName: string }[] };

// Tokens, cost and tool calls across all steps of a turn, for logs and evals.
export function summarizeSteps(steps: readonly Step[]) {
  return {
    inputTokens: steps.reduce((n, s) => n + (s.usage.inputTokens ?? 0), 0),
    outputTokens: steps.reduce((n, s) => n + (s.usage.outputTokens ?? 0), 0),
    costUsd: steps.reduce((n, s) => n + (costUsd(s.providerMetadata) ?? 0), 0),
    tools: steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
  };
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

  return streamText({
    model: model("chat"),
    system: buildSystemPrompt(loadKnowledge()),
    messages: modelMessages,
    tools: chatTools,
    // One step: the model writes its answer and calls show_action in the same
    // response, then the stream ends. With two steps, Haiku re-wrote the whole
    // answer after the tool result (duplicate text at double the cost). See D5.
    stopWhen: isStepCount(1),
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
    // onEnd doesn't fire on abort (user pressed Stop, or the timeout fired),
    // but those turns are still billed. Log what was spent.
    onAbort: (event) => {
      logEvent("chat.aborted", {
        ...base,
        latencyMs: Date.now() - startedAt,
        reason: String(event.reason ?? "aborted"),
        ...summarizeSteps(event.steps),
      });
    },
  });
}
