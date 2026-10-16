"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { LIMITS } from "@/lib/limits";

// Show the counter once the user is within 20% of the cap.
const COUNTER_THRESHOLD = Math.floor(LIMITS.maxInputChars * 0.8);

// Typewriter placeholder: example questions the knowledge base can answer, so a
// visitor who copies one gets a real answer rather than a handoff.
// Each must fit one line on a 360px-wide phone (about 215px of text at 16px),
// or it gets cut off with an ellipsis.
const SUGGESTIONS = [
  "Ask about Cadre AI",
  "Who do you work with?",
  "What is the Maturity Index?",
  "Which AI model fits us?",
  "Can I see case studies?",
  "How do I book a call?",
];
const TYPE_MS = 24; // per character typed
const DELETE_MS = 12; // per character backspaced
const HOLD_MS = 2200; // a finished question stays readable this long
const GAP_MS = 400; // empty box between questions

export function Composer({
  onSend,
  onStop,
  busy,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
}) {
  const [input, setInput] = useState("");
  // Starts fully typed, so the server render and hydration agree.
  const [hint, setHint] = useState(SUGGESTIONS[0]);
  // Where the typewriter is. A ref, so pausing for the visitor's own typing
  // and resuming carries on mid-word instead of restarting.
  const typewriter = useRef({ index: 0, chars: SUGGESTIONS[0].length, deleting: false });
  const empty = input.length === 0;
  const length = input.length;

  // Backspace the current question, type the next, hold, repeat. Runs only
  // while the box is empty. With reduced motion, questions swap whole instead.
  useEffect(() => {
    if (!empty) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const t = typewriter.current;
      let delay = DELETE_MS;
      if (reduceMotion) {
        t.index = (t.index + 1) % SUGGESTIONS.length;
        t.chars = SUGGESTIONS[t.index].length;
        delay = HOLD_MS;
      } else if (t.deleting) {
        t.chars -= 1;
        if (t.chars === 0) {
          t.deleting = false;
          t.index = (t.index + 1) % SUGGESTIONS.length;
          delay = GAP_MS;
        }
      } else if (t.chars < SUGGESTIONS[t.index].length) {
        t.chars += 1;
        delay = t.chars === SUGGESTIONS[t.index].length ? HOLD_MS : TYPE_MS;
      } else {
        t.deleting = true;
        t.chars -= 1;
      }
      setHint(SUGGESTIONS[t.index].slice(0, t.chars));
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, HOLD_MS);
    return () => clearTimeout(timer);
  }, [empty]);
  const tooLong = length > LIMITS.maxInputChars;
  const canSend = !busy && input.trim().length > 0 && !tooLong;

  const submit = () => {
    if (!canSend) return;
    onSend(input.trim());
    setInput("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter inserts a newline. Skip while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-end gap-2 rounded-[1.75rem] bg-white p-2 shadow-pill focus-within:ring-2 focus-within:ring-cadre-blue/30">
        <label htmlFor="chat-input" className="sr-only">
          Ask a question about Cadre AI
        </label>
        <div className="relative flex-1">
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-invalid={tooLong}
            aria-describedby="chat-input-hint"
            className="field-sizing-content block max-h-40 min-h-10 w-full resize-none bg-transparent px-2 py-2.5 text-base text-ink outline-none sm:text-sm"
          />
          {/* A native placeholder can't animate, so the suggestion is drawn over the
              empty box, matching the textarea's padding and type exactly.
              Screen readers get the label instead. */}
          {empty && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 truncate px-2 py-2.5 text-base text-ink-400 sm:text-sm"
            >
              {hint}
            </div>
          )}
        </div>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="h-10 rounded-full border border-hairline px-4 text-sm text-ink-800 transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="h-10 rounded-full bg-cadre-blue px-5 text-sm tracking-[-0.14px] text-white transition-colors hover:bg-cadre-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadre-blue disabled:cursor-not-allowed disabled:opacity-30"
          >
            Send
          </button>
        )}
      </div>
      <div
        id="chat-input-hint"
        className="flex items-start justify-center gap-4 px-3 text-center text-xs text-ink-600"
      >
        {/* The bot is grounded in Cadre's KB but can still be wrong; say so where people read answers. */}
        <span>AI-generated answers can be inaccurate. Please confirm important details with Cadre AI&apos;s team.</span>
        {length >= COUNTER_THRESHOLD && (
          <span
            aria-live="polite"
            className={`shrink-0 ${tooLong ? "font-medium text-red-600" : ""}`}
          >
            {length}/{LIMITS.maxInputChars}
            {tooLong && " · too long to send"}
          </span>
        )}
      </div>
    </form>
  );
}
