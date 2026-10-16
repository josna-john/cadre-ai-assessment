"use client";

import type { UIMessage } from "ai";
import { createContext, useContext, useId, useState, type FormEvent } from "react";
import { resolveActions } from "@/lib/actions";
import { ActionButtons } from "./ActionButtons";
import {
  HANDOFF_TOPICS,
  handoffOfferSchema,
  transcriptOf,
  type HandoffFormField,
  type HandoffOffer,
} from "@/lib/handoff";

// The conversation so far, for the transcript attached to a handoff.
// Provided by MessageList so MessagePart doesn't need to thread it through.
export const ConversationContext = createContext<UIMessage[]>([]);

// Tool output crosses the network as JSON, so check its shape before trusting it.
export function isHandoffOffer(output: unknown): output is HandoffOffer {
  return handoffOfferSchema.safeParse(output).success;
}

type FieldErrors = Partial<Record<HandoffFormField, string>>;
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
  "w-full rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-cadre-blue/50 focus:outline-none focus:ring-2 focus:ring-cadre-blue/20 aria-[invalid=true]:border-red-500";

export function HandoffForm({ offer }: { offer: HandoffOffer }) {
  const messages = useContext(ConversationContext);
  const [state, setState] = useState<State>({ kind: "editing" });
  const id = useId();

  if (state.kind === "sent") {
    return (
      <p role="status" className="rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Thanks, {state.name}. We&apos;ve passed your question to Cadre AI&apos;s team.
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
          firstName: field("firstName"),
          lastName: field("lastName"),
          email: field("email"),
          company: field("company"),
          phone: field("phone"),
          note: field("note"),
          website: field("website"),
          transcript: transcriptOf(messages),
        }),
      });
      if (res.ok) return setState({ kind: "sent", name: field("firstName").trim() });

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
      className="animate-rise space-y-3 rounded-card border border-hairline bg-sand-dark p-4"
    >
      <p id={`${id}-title`} className="font-heading text-base font-semibold tracking-[-0.3px] text-ink">
        Send this to Cadre AI&apos;s team
      </p>

      {/* The model's summary is the lead's "How can we help?" message. It's
          third-person, so it's shown as-is rather than as an editable field
          the visitor would read as their own words. */}
      <div className="rounded-xl bg-white/70 px-3 py-2.5">
        <p className="text-xs font-medium text-ink-600">
          What we&apos;ll send the team · {HANDOFF_TOPICS[offer.topic]}
        </p>
        <p className="mt-1 text-sm text-ink-800">{offer.summary}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-firstName`} label="First name" required error={errors.firstName}>
          <input id={`${id}-firstName`} name="firstName" autoComplete="given-name" required maxLength={50} aria-invalid={!!errors.firstName} className={input} />
        </Field>
        <Field id={`${id}-lastName`} label="Last name" required error={errors.lastName}>
          <input id={`${id}-lastName`} name="lastName" autoComplete="family-name" required maxLength={50} aria-invalid={!!errors.lastName} className={input} />
        </Field>
        <Field id={`${id}-email`} label="Work email" required error={errors.email}>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={!!errors.email} className={input} />
        </Field>
        <Field id={`${id}-phone`} label="Phone number (optional)" error={errors.phone}>
          <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={40} aria-invalid={!!errors.phone} className={input} />
        </Field>
      </div>
      <Field id={`${id}-company`} label="Company name" required error={errors.company}>
        <input id={`${id}-company`} name="company" autoComplete="organization" required maxLength={200} aria-invalid={!!errors.company} className={input} />
      </Field>
      <Field id={`${id}-note`} label="Anything to add? (optional)" error={errors.note}>
        <textarea id={`${id}-note`} name="note" rows={2} maxLength={1000} className={input} />
      </Field>

      {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      {state.kind === "editing" && state.message && (
        <p role="alert" className="text-xs text-red-600">{state.message}</p>
      )}
      {state.kind === "unavailable" && (
        <div role="alert" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>{state.message}</p>
          <ActionButtons actions={resolveActions(["email_team"])} />
        </div>
      )}

      <p className="text-xs text-ink-600">
        Your details and this conversation are shared with Cadre AI&apos;s team so they can reply.
      </p>
      <button
        type="submit"
        disabled={sending}
        className="rounded-full bg-ink px-5 py-3 text-sm sm:py-2 tracking-[-0.14px] text-white transition-colors hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send to the team"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-ink-800">
        {label}
        {/* Visual cue only, like cadre.ai's form; the input's `required` is what
            screen readers announce. */}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-red-600">
            *
          </span>
        )}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Shown when the model offered a handoff but the offer can't be rendered (its
// tool call failed validation). The reply text promises a form, so never leave
// a blank: give the visitor a direct way to reach the team instead.
export function HandoffFallback() {
  return (
    <div className="space-y-2 text-sm">
      <p>The form couldn&apos;t load. You can reach Cadre AI&apos;s team directly:</p>
      <ActionButtons actions={resolveActions(["email_team", "book_call"])} />
    </div>
  );
}
