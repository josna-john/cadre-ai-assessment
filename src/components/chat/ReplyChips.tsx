"use client";

import type { UIMessage } from "ai";
import { type RepliesOutput, chipsView, cleanReplies, isRepliesOutput, suggestRepliesInputSchema } from "@/lib/replies";

// What a finished reply's discovery question needs on screen (D23): its chips,
// and the question itself in code's words if the reply text left it out; no
// chips if the text asks a different question (chipsView).
// Nothing beside a handoff form: the form is the next step there (D20).
// A call that was never executed (the reply hit the output cap after choosing
// them) is checked and cleaned exactly as the tool would, like show_action's fallback.
export function chipsOf(message: UIMessage): { replies: string[]; question?: string } {
  const chips = chosenChips(message);
  if (!chips || hasHandoff(message)) return { replies: [] };
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
  return chipsView(text, chips);
}

const hasHandoff = (message: Pick<UIMessage, "parts">) =>
  message.parts.some((p) => p.type === "tool-offer_handoff");

function chosenChips(message: UIMessage): RepliesOutput | undefined {
  const part = message.parts.find((p) => p.type === "tool-suggest_replies");
  if (!part || !("state" in part)) return undefined;
  if (part.state === "output-available") return isRepliesOutput(part.output) ? part.output : undefined;
  if (part.state === "input-available") {
    const input = suggestRepliesInputSchema.safeParse(part.input);
    return input.success ? { question: input.data.question, replies: cleanReplies(input.data) } : undefined;
  }
  return undefined;
}

// Right-aligned like the visitor's own messages, because a tap sends the chip
// as their reply. The chat box below stays open for any other answer.
export function ReplyChips({ replies, onReply }: { replies: string[]; onReply: (text: string) => void }) {
  if (replies.length === 0) return null;
  return (
    <div role="group" aria-label="Suggested replies" className="flex flex-wrap justify-end gap-2 pl-11">
      {replies.map((reply, i) => (
        <button
          key={reply}
          type="button"
          onClick={() => onReply(reply)}
          style={{ animationDelay: `${i * 60}ms` }}
          className="inline-flex min-h-11 animate-rise items-center rounded-full bg-white px-4 text-sm tracking-[-0.14px] text-ink-800 shadow-pill ring-1 ring-ink/10 transition-colors hover:bg-ink hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {reply}
        </button>
      ))}
    </div>
  );
}
