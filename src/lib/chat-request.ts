import type { UIMessage } from "ai";
import { z } from "zod";
import { LIMITS } from "./limits";

// Validation and capping of the incoming chat request. It's kept separate from
// the route handler so it's unit-testable and has no LLM dependency.
//
// The client sends the whole conversation, so everything here assumes the
// history may be stale, tampered with, or scripted to burn budget.

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.looseObject({ type: z.string() })),
      }),
    )
    .min(1),
});

// Part types the route forwards to the model. Anything else is dropped: user
// files or URLs would bypass the size caps, and unknown assistant parts make
// convertToModelMessages throw.
const ALLOWED_PARTS: Record<"user" | "assistant", ReadonlySet<string>> = {
  user: new Set(["text"]),
  assistant: new Set(["text", "step-start", "tool-show_action", "tool-offer_handoff"]),
};

export type ChatRequestError = {
  status: 400;
  error: "invalid_request" | "empty_message" | "input_too_long";
  message: string;
};

export type ParsedChatRequest = { ok: true; messages: UIMessage[] } | ({ ok: false } & ChatRequestError);

const INVALID: ChatRequestError = {
  status: 400,
  error: "invalid_request",
  message: "That request wasn't understood. Please refresh and try again.",
};

function textOf(message: Pick<UIMessage, "parts">): string {
  return message.parts
    .map((p) => (p.type === "text" && "text" in p ? String(p.text) : ""))
    .join("")
    .trim();
}

export function parseChatRequest(body: unknown): ParsedChatRequest {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, ...INVALID };

  const messages = (parsed.data.messages as UIMessage[])
    // Never trust client-sent system messages: they could override the real prompt.
    .filter((m): m is UIMessage & { role: "user" | "assistant" } => m.role !== "system")
    .map((m) => ({ ...m, parts: m.parts.filter((p) => ALLOWED_PARTS[m.role].has(p.type)) }))
    .filter((m) => m.parts.length > 0);

  const last = messages.at(-1);
  if (!last || last.role !== "user") return { ok: false, ...INVALID };

  const text = textOf(last);
  if (!text) {
    return { ok: false, status: 400, error: "empty_message", message: "Please type a question." };
  }
  if (text.length > LIMITS.maxInputChars) {
    return {
      ok: false,
      status: 400,
      error: "input_too_long",
      message: `Please keep messages under ${LIMITS.maxInputChars} characters.`,
    };
  }

  return { ok: true, messages: trimHistory(messages) };
}

// Keep the newest messages that fit both caps. The latest user message always
// fits, because it was checked against maxInputChars above.
function trimHistory(messages: UIMessage[]): UIMessage[] {
  const kept: UIMessage[] = [];
  let size = 0;
  for (const m of messages.slice(-LIMITS.maxHistoryMessages).reverse()) {
    size += JSON.stringify(m.parts).length;
    if (kept.length > 0 && size > LIMITS.maxHistoryChars) break;
    kept.unshift(m);
  }
  // Anthropic requires the conversation to start with a user turn.
  while (kept.length > 1 && kept[0].role !== "user") kept.shift();
  return kept;
}
