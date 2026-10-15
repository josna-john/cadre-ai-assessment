"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef, type ReactNode } from "react";
import { MessagePart } from "./MessagePart";

export function MessageList({
  messages,
  showTyping,
  footer,
}: {
  messages: UIMessage[];
  showTyping: boolean;
  footer?: ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest content in view as messages stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, showTyping, footer]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Conversation"
      className="space-y-5"
    >
      {messages.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-white">
              <span className="sr-only">You said: </span>
              {message.parts.map((part, i) => (
                <MessagePart key={i} part={part} role="user" />
              ))}
            </div>
          </div>
        ) : (
          <div key={message.id} className="flex justify-start">
            <div className="max-w-[90%] space-y-3 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-2.5 text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-100">
              <span className="sr-only">Assistant: </span>
              {message.parts.map((part, i) => (
                <MessagePart key={i} part={part} role="assistant" />
              ))}
            </div>
          </div>
        ),
      )}

      {showTyping && (
        <div className="flex justify-start">
          <div
            className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3.5 dark:bg-zinc-800/70"
            aria-label="Assistant is typing"
            role="status"
          >
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-2 animate-bounce rounded-full bg-zinc-400"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {footer}
      <div ref={endRef} />
    </div>
  );
}
