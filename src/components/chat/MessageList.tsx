"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef, type ReactNode } from "react";
import { CadreLogo } from "./CadreLogo";
import { ConversationContext } from "./HandoffForm";
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
    <ConversationContext.Provider value={messages}>
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        className="space-y-6"
      >
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex animate-rise justify-end">
              <div className="max-w-[85%] rounded-card rounded-br-md bg-ink px-4 py-2.5 text-white">
                <span className="sr-only">You said: </span>
                {message.parts.map((part, i) => (
                  <MessagePart key={i} part={part} role="user" />
                ))}
              </div>
            </div>
          ) : (
            <AssistantRow key={message.id}>
              <div className="min-w-0 flex-1 space-y-3 sm:max-w-[90%] sm:flex-none rounded-card rounded-tl-md bg-white px-4 py-3 leading-relaxed text-ink-800 shadow-pill">
                <span className="sr-only">Assistant: </span>
                {message.parts.map((part, i) => (
                  <MessagePart
                    key={i}
                    part={part}
                    role="assistant"
                    hasHandoff={message.parts.some((p) => p.type === "tool-offer_handoff")}
                  />
                ))}
              </div>
            </AssistantRow>
          ),
        )}

        {showTyping && (
          <AssistantRow>
            <div
              className="flex items-center gap-1 rounded-card rounded-tl-md bg-white px-4 py-4 shadow-pill"
              aria-label="Assistant is typing"
              role="status"
            >
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-2 animate-bounce rounded-full bg-cadre-blue/50"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </AssistantRow>
        )}

        {footer}
        <div ref={endRef} />
      </div>
    </ConversationContext.Provider>
  );
}

// Assistant replies sit beside a small Cadre mark so it reads as Cadre talking.
function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-rise items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sand-dark text-ink ring-1 ring-hairline"
      >
        <CadreLogo className="h-4 w-auto" />
      </span>
      {children}
    </div>
  );
}
