"use client";

import type { UIMessage } from "ai";
import dynamic from "next/dynamic";
import { createContext, useContext, useId, useRef, useState, type FormEvent } from "react";
import { resolveActions } from "@/lib/actions";
import { ActionButtons } from "./ActionButtons";
import type { PhoneValue } from "./PhoneField";
import {
  HANDOFF_TOPICS,
  NOTE_REQUIRED,
  handoffOfferSchema,
  noteRequired,
  transcriptOf,
  validateField,
  type HandoffFormField,
  type HandoffOffer,
} from "@/lib/handoff";

// Phone numbering rules are ~145 KB; load them only when a form appears.
const PhoneField = dynamic(() => import("./PhoneField"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="h-[38px] rounded-xl border border-hairline bg-white" />,
});

// The conversation so far, for the transcript attached to a handoff.
// Provided by MessageList so MessagePart doesn't need to thread it through.
export const ConversationContext = createContext<UIMessage[]>([]);

// Contact details already sent in this chat, so a second handoff (a new
// question later on) is prefilled instead of asking for everything again.
// Held in memory by MessageList only: it's gone on "New chat" or a reload, and
// never stored in the browser.
export type ContactDetails = Pick<Record<HandoffFormField, string>, "firstName" | "lastName" | "email" | "company" | "phone">;
export const SentDetailsContext = createContext<{
  details?: ContactDetails;
  remember: (d: ContactDetails) => void;
}>({ remember: () => {} });

// Tool output crosses the network as JSON, so check its shape before trusting it.
export function isHandoffOffer(output: unknown): output is HandoffOffer {
  return handoffOfferSchema.safeParse(output).success;
}

type FieldErrors = Partial<Record<HandoffFormField, string>>;
// The form stays mounted in every state but "sent", so a failed submit never
// loses what the visitor typed.
type State =
  | { kind: "editing"; message?: string }
  | { kind: "sending" }
  | { kind: "sent"; name: string }
  | { kind: "unavailable"; message: string };

const UNAVAILABLE = "We couldn't send that just now. You can try again, or email the team instead.";
const RATE_LIMITED = "You've sent several requests already. Please email the team instead.";
const CHECK_FIELDS = "Please check the highlighted fields.";

const TEXT_FIELDS = ["firstName", "lastName", "email", "company", "note"] as const;

const input =
  "w-full rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-cadre-red/50 focus:outline-none focus:ring-2 focus:ring-cadre-red/20 aria-[invalid=true]:border-red-500";

export function HandoffForm({ offer }: { offer: HandoffOffer }) {
  const messages = useContext(ConversationContext);
  const sent = useContext(SentDetailsContext);
  const prefill = sent.details;
  // Opened from a "Talk to an AI strategist" button (D19). With no chat yet,
  // "How can we help you?" is the only context the team gets, so it's required.
  const strategist = offer.topic === "strategy_call";
  const needsNote = noteRequired(offer.topic, transcriptOf(messages));
  const [state, setState] = useState<State>({ kind: "editing" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const phone = useRef<PhoneValue>({ value: prefill?.phone ?? "" });
  const id = useId();

  if (state.kind === "sent") {
    return (
      <p role="status" className="rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {strategist
          ? <>Thanks, {state.name}. Cadre AI&apos;s team will follow up by email to set up a time with a strategist.</>
          : <>Thanks, {state.name}. We&apos;ve passed your question to Cadre AI&apos;s team.</>}
      </p>
    );
  }

  const setError = (field: HandoffFormField, error: string | undefined) =>
    setErrors((prev) => (prev[field] === error ? prev : { ...prev, [field]: error }));

  // Check a field's format when the visitor leaves it, against the same rules
  // the server applies (email whitespace is trimmed, as it is on submit). An
  // empty field isn't flagged here: tabbing past a required field shouldn't
  // nag. Missing fields are reported on submit.
  const checkOnBlur = (field: (typeof TEXT_FIELDS)[number]) => (e: { currentTarget: { value: string } }) => {
    const value = e.currentTarget.value.trim();
    if (value) setError(field, validateField(field, value));
  };
  // Once a field shows an error, clear it as soon as the input becomes valid.
  const recheck = (field: (typeof TEXT_FIELDS)[number]) => (e: { currentTarget: { value: string } }) => {
    if (errors[field]) setError(field, validateField(field, e.currentTarget.value.trim()));
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();

    // Validate everything in the browser first; the server checks again.
    const found: FieldErrors = {};
    for (const f of TEXT_FIELDS) {
      const err = validateField(f, field(f));
      if (err) found[f] = err;
    }
    if (phone.current.error) found.phone = phone.current.error;
    if (needsNote && !field("note")) found.note = NOTE_REQUIRED;
    setErrors(found);
    // Fields in on-screen order, so focus lands on the first problem.
    const firstInvalid = (["firstName", "lastName", "email", "phone", "company", "note"] as const).find((f) => found[f]);
    if (firstInvalid) {
      setState({ kind: "editing", message: CHECK_FIELDS });
      // By id, not [aria-invalid]: the error state hasn't rendered yet.
      document.getElementById(`${id}-${firstInvalid}`)?.focus();
      return;
    }

    const details: ContactDetails = {
      firstName: field("firstName"),
      lastName: field("lastName"),
      email: field("email"),
      company: field("company"),
      phone: phone.current.value,
    };
    setState({ kind: "sending" });

    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...offer,
          ...details,
          note: field("note"),
          website: String(form.get("website") ?? ""),
          transcript: transcriptOf(messages),
        }),
      });
      if (res.ok) {
        sent.remember(details);
        return setState({ kind: "sent", name: details.firstName });
      }

      const body = (await res.json().catch(() => ({}))) as { message?: string; fieldErrors?: FieldErrors };
      if (res.status === 400 && body.fieldErrors) {
        setErrors(body.fieldErrors);
        return setState({ kind: "editing", message: body.message });
      }
      // Over the handoff limit: retrying won't help for a while, so don't suggest it.
      if (res.status === 429) return setState({ kind: "unavailable", message: RATE_LIMITED });
      setState({ kind: "unavailable", message: UNAVAILABLE });
    } catch {
      setState({ kind: "unavailable", message: UNAVAILABLE });
    }
  }

  const sending = state.kind === "sending";
  const errorId = (f: HandoffFormField) => (errors[f] ? `${id}-${f}-error` : undefined);
  const textInput = (f: (typeof TEXT_FIELDS)[number]) => ({
    id: `${id}-${f}`,
    name: f,
    defaultValue: f === "note" ? undefined : prefill?.[f],
    onBlur: checkOnBlur(f),
    onChange: recheck(f),
    "aria-invalid": !!errors[f],
    "aria-describedby": errorId(f),
    className: input,
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="animate-rise space-y-3 rounded-card border border-hairline bg-sand-dark p-4"
    >
      <p id={`${id}-title`} className="font-heading text-base font-semibold tracking-[-0.3px] text-ink">
        {strategist ? "Talk to an AI strategist" : <>Send this to Cadre AI&apos;s team</>}
      </p>

      {strategist ? (
        <p className="text-sm text-ink-600">
          Share a few details and Cadre AI&apos;s team will follow up by email to set up a time.
          {!needsNote && " Our chat so far is included, so they'll have the context."}
        </p>
      ) : (
        // The model's summary is the lead's "How can we help?" message. It's
        // third-person, so it's shown as-is rather than as an editable field
        // the visitor would read as their own words.
        <div className="rounded-xl bg-white/70 px-3 py-2.5">
          <p className="text-xs font-medium text-ink-600">
            What we&apos;ll send the team · {HANDOFF_TOPICS[offer.topic]}
          </p>
          <p className="mt-1 text-sm text-ink-800">{offer.summary}</p>
        </div>
      )}

      {prefill && (
        <p className="text-xs text-ink-600">We&apos;ve filled in the details you gave earlier. Change anything that&apos;s different.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-firstName`} label="First name" required error={errors.firstName}>
          <input {...textInput("firstName")} autoComplete="given-name" required maxLength={50} />
        </Field>
        <Field id={`${id}-lastName`} label="Last name" required error={errors.lastName}>
          <input {...textInput("lastName")} autoComplete="family-name" required maxLength={50} />
        </Field>
        <Field id={`${id}-email`} label="Work email" required error={errors.email}>
          <input {...textInput("email")} type="email" inputMode="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field id={`${id}-phone`} label="Phone number (optional)" error={errors.phone}>
          <PhoneField
            id={`${id}-phone`}
            initial={prefill?.phone}
            invalid={!!errors.phone}
            describedBy={errorId("phone")}
            onChange={(v) => {
              phone.current = v;
              if (errors.phone) setError("phone", v.error);
            }}
            onBlur={() => setError("phone", phone.current.error)}
          />
        </Field>
      </div>
      <Field id={`${id}-company`} label="Company name" required error={errors.company}>
        <input {...textInput("company")} autoComplete="organization" required maxLength={200} />
      </Field>
      {/* Cadre's contact form asks "How can we help you?"; with no chat, it's
          the team's only context, so it's required then (D19). */}
      <Field
        id={`${id}-note`}
        label={strategist ? (needsNote ? "How can we help you?" : "How can we help you? (optional)") : "Anything to add? (optional)"}
        required={needsNote}
        error={errors.note}
      >
        <textarea {...textInput("note")} required={needsNote} rows={needsNote ? 3 : 2} maxLength={1000} />
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
        {needsNote
          ? <>Your details are shared with Cadre AI&apos;s team so they can reply.</>
          : <>Your details and this conversation are shared with Cadre AI&apos;s team so they can reply.</>}
      </p>
      <button
        type="submit"
        disabled={sending}
        className="rounded-full bg-cadre-red px-5 py-3 text-sm sm:py-2 tracking-[-0.14px] text-white transition-colors hover:bg-cadre-red-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadre-red disabled:opacity-60"
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
        {/* Visual cue only, in Cadre's red like cadre.ai's form; the input's
            `required` is what screen readers announce. */}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-cadre-red">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600">
          {error}
        </p>
      )}
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
      {/* Links, not the in-chat form: the form is what just failed. */}
      <ActionButtons actions={resolveActions(["email_team", "book_call"])} external />
    </div>
  );
}
