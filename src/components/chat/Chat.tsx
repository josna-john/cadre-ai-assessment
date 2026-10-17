"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import { ACTIONS } from "@/lib/actions";
import { STRATEGY_CALL_SUMMARY } from "@/lib/handoff";
import { OpenStrategistContext } from "./ActionButtons";
import { CadreLogo } from "./CadreLogo";
import { HandoffForm } from "./HandoffForm";
import { Composer } from "./Composer";
import { ErrorBanner } from "./ErrorBanner";
import { friendlyErrorMessage } from "./errors";
import { MessageList } from "./MessageList";

const STARTERS = [
  "What does Cadre AI do?",
  "What is the AI Maturity Index?",
  "I'm a client. How do I access the portal?",
  "How do you handle data security?",
];

export function Chat() {
  // Default transport posts to /api/chat and reads a UI message stream.
  // A fixed id keeps the Chat constructor from calling generateId() (Math.random)
  // during the static prerender, which Cache Components rejects.
  const { messages, sendMessage, setMessages, status, error, regenerate, stop, clearError } =
    useChat({ id: "support-chat" });

  const busy = status === "submitted" || status === "streaming";

  // "Talk to an AI strategist" opens the chat's own lead form instead of
  // leaving for cadre.ai/contact (D19). It appears after the messages so far
  // and stays there. While it's open, clicking again scrolls back to it; once
  // it's sent, clicking again opens a fresh one at the current point.
  // `key` remounts the form when a fresh one opens.
  const [strategist, setStrategist] = useState<{ at: number; key: number; state: "untouched" | "touched" | "sent" } | null>(null);
  const [scrollToForm, setScrollToForm] = useState(0);
  const openStrategist = () => {
    setStrategist((s) =>
      s && s.state !== "sent" ? s : { at: messages.length, key: (s?.key ?? 0) + 1, state: "untouched" },
    );
    setScrollToForm((n) => n + 1);
  };
  const markStrategist = (state: "touched" | "sent") =>
    setStrategist((s) => (s && s.state !== state && s.state !== "sent" ? { ...s, state } : s));
  useEffect(() => {
    if (!scrollToForm) return;
    const form = document.getElementById("strategist-form");
    form?.scrollIntoView({ behavior: "smooth", block: "start" });
    form?.querySelector<HTMLInputElement>("input:not([type=hidden]), textarea")?.focus({ preventScroll: true });
  }, [scrollToForm]);
  const strategistForm = strategist && (
    <div id="strategist-form" className="scroll-mt-4">
      <HandoffForm
        key={strategist.key}
        offer={{ topic: "strategy_call", summary: STRATEGY_CALL_SUMMARY }}
        onTouched={() => markStrategist("touched")}
        onSent={() => markStrategist("sent")}
        onClose={strategist.state === "sent" ? undefined : () => setStrategist(null)}
      />
    </div>
  );

  // A visitor who opens the form but starts chatting instead has changed their
  // mind: an untouched form closes, so it doesn't sit above the conversation
  // claiming a context it never had. One they've typed in stays.
  const send = (text: string) => {
    if (strategist?.state === "untouched") setStrategist(null);
    void sendMessage({ text });
  };

  // Back to the welcome screen. Stop first so a reply still streaming can't
  // land in the fresh conversation. Handoff forms reset because they unmount.
  const restart = () => {
    if (busy) void stop();
    setMessages([]);
    setStrategist(null);
    clearError();
    document.getElementById("chat-input")?.focus();
  };

  return (
    <OpenStrategistContext.Provider value={openStrategist}>
    <div className="flex h-dvh w-full flex-col">
      <header className="border-t-[3px] border-b border-t-cadre-red border-b-hairline bg-sand-dark">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-white text-ink shadow-pill"
            >
              <CadreLogo className="h-5 w-auto" />
            </span>
            <h1 className="font-brand text-2xl font-semibold tracking-tight text-ink">
              Cadena
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={restart}
                className="inline-flex animate-rise items-center gap-1.5 rounded-full bg-white px-3.5 py-3 text-sm sm:py-2 tracking-[-0.14px] text-ink-800 shadow-pill transition-colors hover:bg-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 fill-none stroke-current stroke-[1.75]">
                  <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                </svg>
                New chat
              </button>
            )}
            <button
              type="button"
              onClick={openStrategist}
              className="hidden rounded-full bg-ink px-4 py-2 text-sm tracking-[-0.14px] text-white transition-colors hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:inline-block"
            >
              {ACTIONS.book_call.label}
            </button>
          </div>
        </div>
      </header>

      {/* `relative` contains the absolutely positioned sr-only labels in messages;
          without it they escape this scroller and give the page a second scrollbar. */}
      <main className="relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          {messages.length === 0 ? (
            <section aria-labelledby="welcome-title" className="mt-4 space-y-8 sm:mt-10">
              <div className="space-y-3">
                <p className="animate-rise text-lg text-ink-600">
                  Hi, I&apos;m <span className="font-medium text-cadre-red">Cadena</span>{" "}
                  <span
                    role="img"
                    aria-label="waving hand"
                    className="inline-block origin-[70%_70%] animate-wave"
                  >
                    👋
                  </span>
                </p>
                <h2
                  id="welcome-title"
                  className="animate-rise font-heading text-4xl leading-[110%] font-medium tracking-[-1.44px] text-ink-800 [animation-delay:80ms] sm:text-5xl sm:tracking-[-1.8px]"
                >
                  {/* Echoes cadre.ai's "From AI Confusion to AI Confidence" hero. */}
                  Curious about AI?
                  <br />
                  Let&apos;s get you <span className="text-cadre-red">answers</span>.
                </h2>
                <p className="max-w-lg animate-rise text-base text-ink-600 [animation-delay:160ms]">
                  Ask me anything about Cadre: what we do, who we work with, or where to start.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {STARTERS.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={busy}
                    style={{ animationDelay: `${240 + i * 70}ms` }}
                    className="group flex animate-rise items-center justify-between gap-3 rounded-card bg-sand-dark px-4 py-3.5 text-left text-sm text-ink-800 shadow-pill transition-[translate,box-shadow,background-color] duration-300 ease-out-expo hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--shadow-pill),var(--shadow-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {q}
                    <span
                      aria-hidden="true"
                      className="text-cadre-red transition-transform group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </button>
                ))}
              </div>
              {strategistForm}
            </section>
          ) : (
            <MessageList
              messages={messages}
              showTyping={status === "submitted"}
              streaming={busy}
              inserted={
                strategist
                  ? { after: strategist.at, node: strategistForm, open: strategist.state !== "sent" }
                  : undefined
              }
              footer={
                error && (
                  <ErrorBanner
                    message={friendlyErrorMessage(error)}
                    onRetry={() => void regenerate()}
                    canRetry={!busy}
                  />
                )
              }
            />
          )}
        </div>
      </main>

      <div className="border-t border-hairline bg-sand-dark">
        <div className="mx-auto max-w-3xl px-4 pt-3 pb-4 sm:px-6">
          <Composer onSend={send} onStop={() => void stop()} busy={busy} />
        </div>
      </div>
    </div>
    </OpenStrategistContext.Provider>
  );
}
