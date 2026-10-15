"use client";

import { useChat } from "@ai-sdk/react";
import { Composer } from "./Composer";
import { ErrorBanner } from "./ErrorBanner";
import { friendlyErrorMessage } from "./errors";
import { MessageList } from "./MessageList";

const STARTERS = [
  "What does Cadre AI do?",
  "Do you work with construction companies?",
  "What is the AI Maturity Index?",
  "I'm a client — how do I access the portal?",
  "How do you handle data security?",
];

export function Chat() {
  // Default transport posts to /api/chat and reads a UI message stream.
  // A fixed id keeps the Chat constructor from calling generateId() (Math.random)
  // during the static prerender, which Cache Components rejects.
  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    id: "support-chat",
  });

  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => void sendMessage({ text });

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col">
      <header className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <h1 className="text-lg font-semibold tracking-tight">Cadre AI Assistant</h1>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          AI assistant — answers come from Cadre&apos;s public information; a human can
          follow up.
        </p>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <section aria-labelledby="welcome-title" className="mt-6 space-y-5">
            <div>
              <h2 id="welcome-title" className="text-xl font-semibold tracking-tight">
                Hi! How can we help?
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Ask about Cadre&apos;s services, industries, the AI Maturity Index, or the
                client portal.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={busy}
                  className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-left text-sm text-zinc-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-400/10"
                >
                  {q}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <MessageList
            messages={messages}
            showTyping={status === "submitted"}
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
      </main>

      <div className="border-t border-zinc-200 px-4 pt-3 pb-4 dark:border-zinc-800">
        <Composer onSend={send} onStop={() => void stop()} busy={busy} />
      </div>
    </div>
  );
}
