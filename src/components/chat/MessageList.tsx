"use client";

import type { UIMessage } from "ai";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SOURCES, citedSources, type SourceId } from "@/lib/sources";
import { CadreLogo } from "./CadreLogo";
import { ConversationContext, SentDetailsContext, type ContactDetails } from "./HandoffForm";
import { MessagePart } from "./MessagePart";
import { ReplyChips, chipsOf } from "./ReplyChips";

// Every source a reply cites, in order, across all its text parts.
const sourcesOf = (message: UIMessage) =>
  citedSources(message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" "));

// A reply that cites an industry page or a case study's card already links its
// specifics, so the generic "See case studies" button would be a weaker
// duplicate. The prompt asks for this; this is the deterministic backstop.
const citesSpecifics = (sources: SourceId[]) =>
  sources.some((id) => id.startsWith("industry_") || id.startsWith("case_study_"));

export function MessageList({
  messages,
  showTyping,
  streaming,
  footer,
  inserted,
  onReply,
}: {
  messages: UIMessage[];
  showTyping: boolean;
  // The last reply is still arriving.
  streaming: boolean;
  footer?: ReactNode;
  // Sends a tapped answer chip as the visitor's message (D23).
  onReply?: (text: string) => void;
  // Rendered after the first `after` messages and kept there as the chat
  // continues: the strategist form stays where the visitor opened it (D19).
  // While it's `open` (not yet sent), later replies point to it instead of
  // showing a second form.
  inserted?: { after: number; node: ReactNode; open: boolean };
}) {
  const endRef = useRef<HTMLDivElement>(null);
  // Details from a handoff already sent in this chat. This component unmounts
  // on "New chat" (no messages), which resets them.
  const [sentDetails, setSentDetails] = useState<ContactDetails>();
  const sent = useMemo(() => ({ details: sentDetails, remember: setSentDetails }), [sentDetails]);

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
                <div className="max-w-[85%] rounded-card rounded-br-md bg-ink px-4 py-3 leading-relaxed text-white sm:px-5">
                  <span className="sr-only">You said: </span>
                  {message.parts.map((part, i) => (
                    <MessagePart key={i} part={part} role="user" />
                  ))}
                </div>
              </div>
            ) : (
              <AssistantMessage
                message={message}
                // Only the reply that shows the form hides the booking button.
                // A later "how do I book a call?" must get the button its text
                // promises, even with an unsent form further up (prod, 2026-10-17).
                hasHandoff={message.parts.some((p) => p.type === "tool-offer_handoff")}
                formAbove={!!inserted?.open && index >= inserted.after}
                finished={!(streaming && index === messages.length - 1)}
              />
            )}
            {/* Answer chips belong to the open question only: the newest reply,
                once it has finished. Replying in any way moves past them, and a
                strategist form opened below the reply takes over as the next step. */}
            {message.role === "assistant" &&
              index === messages.length - 1 &&
              !streaming &&
              onReply &&
              !(inserted?.open && inserted.after === messages.length) && (
              <ReplyChips replies={chipsOf(message).replies} onReply={onReply} />
            )}
            {inserted?.after === index + 1 && inserted.node}
            </Fragment>
          ))}

          {showTyping && (
            <AssistantRow>
              <div
                className="flex items-center gap-1.5 rounded-card rounded-tl-md bg-white px-5 py-[18px] shadow-pill"
                aria-label="Assistant is typing"
                role="status"
              >
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="size-2 animate-typing rounded-full bg-cadre-red"
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

function AssistantMessage({
  message,
  hasHandoff,
  formAbove,
  finished,
}: {
  message: UIMessage;
  hasHandoff: boolean;
  formAbove: boolean;
  finished: boolean;
}) {
  const sources = sourcesOf(message);
  // The discovery question in code's words, when the reply's chips need one
  // its text didn't ask (D23). It stays with the reply, like its text.
  const question = finished ? chipsOf(message).question : undefined;
  // It follows the reply's text, before any buttons, so it reads as the
  // reply's last sentence.
  const lastText = message.parts.findLastIndex((p) => p.type === "text");
  return (
    <AssistantRow>
      <div className="min-w-0 flex-1 space-y-4 rounded-card rounded-tl-md bg-white px-5 py-4 leading-relaxed text-ink-800 shadow-[var(--shadow-pill),var(--shadow-card)] sm:max-w-[90%] sm:flex-none">
        <span className="sr-only">Assistant: </span>
        {message.parts.map((part, i) => (
          <Fragment key={i}>
            <MessagePart
              part={part}
              role="assistant"
              hasHandoff={hasHandoff}
              citesSpecifics={citesSpecifics(sources)}
              formAbove={formAbove}
              finished={finished}
              sourceOrder={sources}
            />
            {question && i === lastText && <p className="animate-rise">{question}</p>}
          </Fragment>
        ))}
        {/* The cited pages in one place, numbered like the dots in the text,
            once the reply has finished (so the row doesn't reflow mid-stream). */}
        {finished && sources.length > 0 && (
          <div className="flex animate-rise flex-wrap items-center gap-2 border-t border-ink/5 pt-3.5">
            <span className="mr-1 text-xs text-ink-600">Sources</span>
            {sources.map((id, i) => (
              <a
                key={id}
                href={SOURCES[id].href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-sand py-1 pr-3 pl-1 text-[13px] text-ink-800 ring-1 ring-hairline transition-colors hover:bg-sand-dark focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cadre-red-dark"
              >
                <span
                  aria-hidden="true"
                  className="flex size-[22px] items-center justify-center rounded-full bg-cadre-red-tint text-[11px] font-semibold text-cadre-red-deep"
                >
                  {i + 1}
                </span>
                {SOURCES[id].label}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </AssistantRow>
  );
}

// Assistant replies sit beside a small Cadre mark so it reads as Cadre talking.
function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-rise items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-[34px] shrink-0 items-center justify-center rounded-full bg-sand-dark text-ink ring-1 ring-cadre-red/30"
      >
        <CadreLogo className="h-4 w-auto" />
      </span>
      {children}
    </div>
  );
}
