"use client";

import { createContext, useContext } from "react";
import type { ResolvedAction } from "@/lib/actions";

// Opens the strategist form in the chat (D19). Provided by Chat; without it
// (or with `external`), "Talk to an AI strategist" is a plain link to
// cadre.ai/contact, which is the fallback when the chat's own form can't be used.
export const OpenStrategistContext = createContext<(() => void) | null>(null);

// The first action is the reply's main next step and gets the red fill; any
// others are quieter sand pills, so a row of CTAs doesn't shout.
const pillBase =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm tracking-[-0.14px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";
const pill = (primary: boolean) =>
  primary
    ? `${pillBase} bg-cadre-red-dark text-white hover:bg-cadre-red-deep focus-visible:outline-cadre-red-dark`
    : `${pillBase} bg-sand-dark text-ink shadow-pill hover:bg-card-hover focus-visible:outline-ink`;

// Tool output crosses the network as JSON, so check its shape before trusting it.
export function isActionsOutput(output: unknown): output is { actions: ResolvedAction[] } {
  if (!output || typeof output !== "object") return false;
  const actions = (output as { actions?: unknown }).actions;
  return (
    Array.isArray(actions) &&
    actions.every(
      (a) =>
        a &&
        typeof a === "object" &&
        typeof (a as ResolvedAction).id === "string" &&
        typeof (a as ResolvedAction).label === "string" &&
        typeof (a as ResolvedAction).href === "string",
    )
  );
}

export function ActionButtons({ actions, external: forceLinks = false }: { actions: ResolvedAction[]; external?: boolean }) {
  const openStrategist = useContext(OpenStrategistContext);
  if (actions.length === 0) return null;
  return (
    <div className="flex animate-rise flex-wrap gap-2">
      {actions.map((action, i) => {
        if (action.id === "book_call" && openStrategist && !forceLinks) {
          return (
            <button key={action.id} type="button" onClick={openStrategist} className={pill(i === 0)}>
              {action.label}
              <span aria-hidden="true">→</span>
            </button>
          );
        }
        const external = action.href.startsWith("http");
        return (
          <a
            key={action.id}
            href={action.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={pill(i === 0)}
          >
            {action.label}
            <span aria-hidden="true">{external ? "↗" : "→"}</span>
            {external && <span className="sr-only">(opens in a new tab)</span>}
          </a>
        );
      })}
    </div>
  );
}

export function ActionPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-11 w-44 animate-pulse rounded-full bg-ink/5"
    />
  );
}
