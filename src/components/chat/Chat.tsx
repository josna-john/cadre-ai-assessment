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

// Each starter is labelled with the topic it covers, so the welcome screen
// doubles as a map of what Cadena can answer. Icon paths are 24×24 strokes.
const STARTERS = [
  { q: "What does Cadre AI do?", topic: "Services", icon: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" },
  { q: "What is the AI Maturity Index?", topic: "Assessment", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { q: "I'm a client. How do I access the portal?", topic: "Client portal", icon: "M3 7a3 3 0 013-3h12a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3zM3 9h18M8 14h4" },
  { q: "How do you handle data security?", topic: "Security", icon: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4" },
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
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-pill"
            >
              <CadreLogo className="h-5 w-auto" />
            </span>
            <div className="leading-tight">
              <h1 className="font-brand text-[22px] font-semibold tracking-[-0.4px] text-ink">Cadena</h1>
              <p className="text-xs text-ink-600">by Cadre AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={restart}
                className="inline-flex min-h-11 animate-rise items-center gap-1.5 rounded-full bg-white px-4 text-sm tracking-[-0.14px] text-ink-800 shadow-pill transition-colors hover:bg-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
              aria-label={ACTIONS.book_call.label}
              className="inline-flex size-11 items-center justify-center rounded-full bg-ink text-sm tracking-[-0.14px] text-white transition-colors hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-auto sm:px-5"
            >
              {/* Phones get a chat icon; the label is the accessible name either way. */}
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] fill-none stroke-current stroke-[1.8] sm:hidden">
                <path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-5A8 8 0 1121 12z" strokeLinejoin="round" />
              </svg>
              <span aria-hidden="true" className="hidden sm:inline">{ACTIONS.book_call.label}</span>
            </button>
          </div>
        </div>
      </header>

      {/* `relative` contains the absolutely positioned sr-only labels in messages;
          without it they escape this scroller and give the page a second scrollbar. */}
      <main className="relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pt-6 pb-4 sm:px-6 sm:pt-8">
          {messages.length === 0 ? (
            <section aria-labelledby="welcome-title" className="space-y-7 sm:space-y-9">
              <div className="space-y-3 sm:space-y-4">
                {/* Cadena introduces itself like a person: a face, a name and a wave. */}
                <div className="animate-rise pb-2 leading-tight sm:pb-3">
                  <p className="text-xl font-medium tracking-[-0.3px] text-ink-800">
                    Hi, I&apos;m Cadena{" "}
                    <span role="img" aria-label="waving hand" className="inline-block origin-[70%_70%] animate-wave">
                      👋
                    </span>
                  </p>
                  <p className="mt-1.5 text-[11px] font-semibold tracking-[0.4px] text-cadre-red-deep uppercase">
                    Cadre AI assistant
                  </p>
                </div>
                <h2
                  id="welcome-title"
                  className="animate-rise font-heading text-[2.25rem] leading-[1.05] font-medium tracking-[-0.035em] text-[#1a1416] [animation-delay:80ms] sm:text-5xl md:text-[3.5rem]"
                >
                  {/* Echoes cadre.ai's "From AI Confusion to AI Confidence" hero. */}
                  Curious about AI?{" "}
                  <br className="hidden sm:inline" />
                  Let&apos;s get you <span className="text-cadre-red">answers</span>.
                </h2>
                <p className="max-w-2xl animate-rise text-base leading-relaxed text-ink-600 [animation-delay:160ms]">
                  Ask me anything about Cadre: what we do, who we work with, or where to start.
                </p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                {STARTERS.map(({ q, topic, icon }, i) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={busy}
                    style={{ animationDelay: `${240 + i * 70}ms` }}
                    className="group flex animate-rise items-center gap-3.5 rounded-card bg-sand-dark px-4 py-3 text-left shadow-pill transition-[translate,box-shadow,background-color] duration-500 ease-out-expo hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--shadow-pill),0_20px_28px_#0000000d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white">
                      <svg viewBox="0 0 24 24" className="size-[18px] fill-none stroke-cadre-red-dark stroke-[1.8]">
                        <path d={icon} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] tracking-[0.3px] text-ink-600 uppercase">{topic}</span>
                      <span className="block text-[15px] leading-snug font-medium text-[#1a1416]">{q}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="hidden text-cadre-red-dark transition-transform duration-300 group-hover:translate-x-[3px] sm:inline"
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
