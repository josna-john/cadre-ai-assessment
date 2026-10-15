"use client";

import type { UIMessage } from "ai";
import { createContext, useContext, useId, useState, type FormEvent } from "react";
import { resolveActions } from "@/lib/actions";
import { ActionButtons } from "./ActionButtons";
import { HANDOFF_TOPICS, handoffOfferSchema, transcriptOf, type HandoffOffer } from "@/lib/handoff";

// The conversation so far, for the transcript attached to a handoff.
// Provided by MessageList so MessagePart doesn't need to thread it through.
export const ConversationContext = createContext<UIMessage[]>([]);

// Tool output crosses the network as JSON, so check its shape before trusting it.
export function isHandoffOffer(output: unknown): output is HandoffOffer {
  return handoffOfferSchema.safeParse(output).success;
}

type FieldErrors = Partial<Record<"name" | "email" | "company" | "note", string>>;
// The form stays mounted in every state but "sent", so a failed submit never
// loses what the visitor typed.
type State =
  | { kind: "editing"; fieldErrors?: FieldErrors; message?: string }
  | { kind: "sending" }
  | { kind: "sent"; name: string }
  | { kind: "unavailable"; message: string };

const UNAVAILABLE = "We couldn't send that just now. You can try again, or email the team instead.";
const RATE_LIMITED = "You've sent several requests already. Please email the team instead.";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function HandoffForm({ offer }: { offer: HandoffOffer }) {
  const messages = useContext(ConversationContext);
  const [state, setState] = useState<State>({ kind: "editing" });
  const id = useId();

  if (state.kind === "sent") {
    return (
      <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
        Thanks, {state.name}. We&apos;ve passed your question to Cadre&apos;s team.
      </p>
    );
  }

  const errors = state.kind === "editing" ? (state.fieldErrors ?? {}) : {};

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "");
    setState({ kind: "sending" });

    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...offer,
          name: field("name"),
          email: field("email"),
          company: field("company"),
          note: field("note"),
          website: field("website"),
          transcript: transcriptOf(messages),
        }),
      });
      if (res.ok) return setState({ kind: "sent", name: field("name").trim() });

      const body = (await res.json().catch(() => ({}))) as { message?: string; fieldErrors?: FieldErrors };
      if (res.status === 400 && body.fieldErrors) {
        return setState({ kind: "editing", fieldErrors: body.fieldErrors, message: body.message });
      }
      // Over the handoff limit: retrying won't help for a while, so don't suggest it.
      if (res.status === 429) return setState({ kind: "unavailable", message: RATE_LIMITED });
      setState({ kind: "unavailable", message: UNAVAILABLE });
    } catch {
      setState({ kind: "unavailable", message: UNAVAILABLE });
    }
  }

  const sending = state.kind === "sending";

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="space-y-2.5 rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div>
        <p id={`${id}-title`} className="text-sm font-semibold">
          Send this to Cadre&apos;s team
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {HANDOFF_TOPICS[offer.topic]}: {offer.summary}
        </p>
      </div>

      <Field id={`${id}-name`} label="Name" error={errors.name}>
        <input id={`${id}-name`} name="name" autoComplete="name" required maxLength={100} aria-invalid={!!errors.name} className={input} />
      </Field>
      <Field id={`${id}-email`} label="Work email" error={errors.email}>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={!!errors.email} className={input} />
      </Field>
      <Field id={`${id}-company`} label="Company (optional)" error={errors.company}>
        <input id={`${id}-company`} name="company" autoComplete="organization" maxLength={200} className={input} />
      </Field>
      <Field id={`${id}-note`} label="Anything to add? (optional)" error={errors.note}>
        <textarea id={`${id}-note`} name="note" rows={2} maxLength={1000} className={input} />
      </Field>

      {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      {state.kind === "editing" && state.message && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">{state.message}</p>
      )}
      {state.kind === "unavailable" && (
        <div role="alert" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <p>{state.message}</p>
          <ActionButtons actions={resolveActions(["email_team"])} />
        </div>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Your name, email and this conversation are shared with Cadre&apos;s team so they can reply.
      </p>
      <button
        type="submit"
        disabled={sending}
        className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send to the team"}
      </button>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

// Shown when the model offered a handoff but the offer can't be rendered (its
// tool call failed validation). The reply text promises a form, so never leave
// a blank: give the visitor a direct way to reach the team instead.
export function HandoffFallback() {
  return (
    <div className="space-y-2 text-sm">
      <p>The form couldn&apos;t load. You can reach Cadre&apos;s team directly:</p>
      <ActionButtons actions={resolveActions(["email_team", "book_call"])} />
    </div>
  );
}
