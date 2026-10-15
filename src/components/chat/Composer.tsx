"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { LIMITS } from "@/lib/limits";

// Show the counter once the user is within 20% of the cap.
const COUNTER_THRESHOLD = Math.floor(LIMITS.maxInputChars * 0.8);

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
  const length = input.length;
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
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900">
        <label htmlFor="chat-input" className="sr-only">
          Ask a question about Cadre AI
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask about Cadre AI…"
          aria-invalid={tooLong}
          aria-describedby="chat-input-hint"
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-zinc-400 sm:text-sm"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        )}
      </div>
      <div
        id="chat-input-hint"
        className="flex justify-between px-1 text-xs text-zinc-500 dark:text-zinc-400"
      >
        <span>Enter to send · Shift+Enter for a new line</span>
        {length >= COUNTER_THRESHOLD && (
          <span
            aria-live="polite"
            className={tooLong ? "font-medium text-red-600 dark:text-red-400" : undefined}
          >
            {length}/{LIMITS.maxInputChars}
            {tooLong && " · too long to send"}
          </span>
        )}
      </div>
    </form>
  );
}
