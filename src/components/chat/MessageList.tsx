"use client";

import type { UIMessage } from "ai";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { citedSources } from "@/lib/sources";
import { CadreLogo } from "./CadreLogo";
import { ConversationContext, SentDetailsContext, type ContactDetails } from "./HandoffForm";
import { MessagePart } from "./MessagePart";

// A reply that cites an industry page or a case study's card already links its
// specifics, so the generic "See case studies" button would be a weaker
// duplicate. The prompt asks for this; this is the deterministic backstop.
const citesSpecifics = (message: UIMessage) =>
  citedSources(message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ")).some(
    (id) => id.startsWith("industry_") || id.startsWith("case_study_"),
  );

export function MessageList({
  messages,
  showTyping,
  streaming,
  footer,
  inserted,
}: {
  messages: UIMessage[];
  showTyping: boolean;
  // The last reply is still arriving.
  streaming: boolean;
  footer?: ReactNode;
  // Rendered after the first `after` messages and kept there as the chat
  // continues: the strategist form stays where the visitor opened it (D19).
  inserted?: { after: number; node: ReactNode };
}) {
  const endRef = useRef<HTMLDivElement>(null);
  // Details from a handoff already sent in this chat. This component unmounts
  // on "New chat" (no messages), which resets them.
  const [sentDetails, setSentDetails] = useState<ContactDetails>();
  const sent = useMemo(() => ({ details: sentDetails, remember: setSentDetails }), [sentDetails]);

  // The first reply that offered the handoff form. That reply and every one
  // after it hide the booking button, since the form already reaches the team.
  const firstHandoff = messages.findIndex((m) =>
    m.parts.some((p) => p.type === "tool-offer_handoff"),
  );

  // Keep the newest content in view as messages stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, showTyping, footer]);

  return (
    <ConversationContext.Provider value={messages}>
      <SentDetailsContext.Provider value={sent}>
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversation"
          className="space-y-6"
        >
          {inserted?.after === 0 && inserted.node}
          {messages.map((message, index) => (
            <Fragment key={message.id}>
            {message.role === "user" ? (
              <div className="flex animate-rise justify-end">
                <div className="max-w-[85%] rounded-card rounded-br-md bg-ink px-4 py-2.5 text-white">
                  <span className="sr-only">You said: </span>
                  {message.parts.map((part, i) => (
                    <MessagePart key={i} part={part} role="user" />
                  ))}
                </div>
              </div>
            ) : (
              <AssistantRow>
                <div className="min-w-0 flex-1 space-y-3 sm:max-w-[90%] sm:flex-none rounded-card rounded-tl-md bg-white px-4 py-3 leading-relaxed text-ink-800 shadow-pill">
                  <span className="sr-only">Assistant: </span>
                  {message.parts.map((part, i) => (
                    <MessagePart
                      key={i}
                      part={part}
                      role="assistant"
                      hasHandoff={firstHandoff !== -1 && index >= firstHandoff}
                      citesSpecifics={citesSpecifics(message)}
                      finished={!(streaming && index === messages.length - 1)}
                    />
                  ))}
                </div>
              </AssistantRow>
            )}
            {inserted?.after === index + 1 && inserted.node}
            </Fragment>
          ))}

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
                    className="size-2 animate-bounce rounded-full bg-cadre-red/50"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </AssistantRow>
          )}

          {footer}
          <div ref={endRef} />
        </div>
      </SentDetailsContext.Provider>
    </ConversationContext.Provider>
  );
}

// Assistant replies sit beside a small Cadre mark so it reads as Cadre talking.
function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-rise items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sand-dark text-ink ring-1 ring-cadre-red/30"
      >
        <CadreLogo className="h-4 w-auto" />
      </span>
      {children}
    </div>
  );
}
