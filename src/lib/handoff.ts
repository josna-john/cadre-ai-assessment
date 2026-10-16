import { z } from "zod";

// Escalation to Cadre's team. The flow has two halves, and the model only
// touches the first:
// 1. The model calls `offer_handoff` with a topic and a one-line summary. The
//    UI renders a form; nothing is saved yet.
// 2. The visitor fills in their own contact details and submits. That POST
//    (/api/handoff) is validated here and saved by src/lib/handoff-store.ts.
// So consent is an explicit click, and contact details never pass through
// the model.
//
// This file is shared by the server and the browser: keep it free of secrets
// and server-only imports.

// Routing keys for the team. Mirrors the "Not published" list in
// knowledge/06-not-published.md. The migration's CHECK constraint must match
// (a unit test asserts it).
export const HANDOFF_TOPICS = {
  pricing: "Pricing",
  security_compliance: "Security & compliance",
  portal_access: "Portal access",
  account_specific: "Your account",
  partnership_legal: "Contracts & partnerships",
  other: "General question",
} as const;

export const handoffTopicSchema = z.enum(
  Object.keys(HANDOFF_TOPICS) as [keyof typeof HANDOFF_TOPICS, ...(keyof typeof HANDOFF_TOPICS)[]],
);
export type HandoffTopic = z.infer<typeof handoffTopicSchema>;

export const HANDOFF_SUMMARY_MAX = 300;

// What the tool returns to the UI, and what the visitor's submit carries back.
export const handoffOfferSchema = z.object({
  topic: handoffTopicSchema,
  summary: z.string().trim().min(1).max(HANDOFF_SUMMARY_MAX),
});
export type HandoffOffer = z.infer<typeof handoffOfferSchema>;

// The tool's *input* schema is looser on length: a long summary is clipped in
// execute() rather than failing the tool call, which would leave the visitor
// with "use the form below" and no form.
export const handoffToolInputSchema = z.object({
  topic: handoffTopicSchema,
  summary: z.string().trim().min(1),
});

export function clipSummary(summary: string): string {
  return safeSlice(summary.trim(), HANDOFF_SUMMARY_MAX);
}

// Slice by UTF-16 units without leaving half an emoji: Postgres jsonb rejects
// a lone surrogate, which would turn a real visitor's submit into a 503.
function safeSlice(text: string, max: number): string {
  return text.slice(0, max).replace(/[\uD800-\uDBFF]$/, "");
}

// Postgres text and jsonb reject NUL characters, so refuse them up front
// (as a 400) instead of failing the insert (a 503).
const noNul = (s: string) => !s.includes("\0");
const UNSUPPORTED = "Please remove unsupported characters.";

export const HANDOFF_TRANSCRIPT_TURNS = 10;
const TRANSCRIPT_TEXT_MAX = 2000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(noNul, UNSUPPORTED)
    .optional()
    .transform((v) => (v ? v : undefined));

const requiredText = (max: number, missing: string) =>
  z.string().trim().min(1, missing).max(max).refine(noNul, UNSUPPORTED);

// The form submits phone numbers in E.164 ("+16195550100"). This is a cheap
// shape check; the strict per-country check needs ~145 KB of numbering rules,
// so it lives server-side in the route (src/lib/phone.ts), not in this
// browser-shared module.
const E164 = /^\+[1-9]\d{6,14}$/;
const INVALID_PHONE = "Please enter a valid phone number for the selected country.";

// What the visitor submits. Required fields mirror Cadre's own contact form
// (cadre.ai/contact: first and last name, company, work email), so a handoff
// is a complete lead and nobody has to fill that form in again. The model's
// summary stands in for its "How can we help you?" message.
export const handoffSubmissionSchema = handoffOfferSchema.extend({
  summary: handoffOfferSchema.shape.summary.refine(noNul),
  firstName: requiredText(50, "Please enter your first name."),
  lastName: requiredText(50, "Please enter your last name."),
  email: z.email("Please enter a valid email address.").max(254),
  company: requiredText(200, "Please enter your company name."),
  phone: optionalText(16).refine((v) => !v || E164.test(v), INVALID_PHONE),
  note: optionalText(1000),
  transcript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(TRANSCRIPT_TEXT_MAX).refine(noNul),
      }),
    )
    .max(HANDOFF_TRANSCRIPT_TURNS),
  // Honeypot: hidden from people, often filled in by bots. A non-empty value
  // is accepted silently but not saved.
  website: z.string().max(200).optional(),
});
export type HandoffSubmission = z.infer<typeof handoffSubmissionSchema>;

// Fields a person types, so the form can highlight them. Errors anywhere else
// mean the request itself is broken, and retrying won't help.
export const HANDOFF_FORM_FIELDS = ["firstName", "lastName", "email", "company", "phone", "note"] as const;
export type HandoffFormField = (typeof HANDOFF_FORM_FIELDS)[number];
export { INVALID_PHONE };

// One field against the same rules the server applies, so the form can flag a
// mistake when the visitor leaves the field instead of only after submitting.
export function validateField(field: HandoffFormField, value: string): string | undefined {
  const result = handoffSubmissionSchema.shape[field].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

// The last few turns as plain text, for the team's context. Shared by the
// form (to build the request) and tests. It's visitor-supplied, so the team
// should treat it as context, not a record of what the bot said.
export function transcriptOf(
  messages: { role: string; parts: { type: string; text?: string }[] }[],
): HandoffSubmission["transcript"] {
  return messages
    .filter((m): m is typeof m & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      text: safeSlice(
        m.parts
          .map((p) => (p.type === "text" && p.text ? p.text : ""))
          .filter(Boolean)
          .join("\n"),
        TRANSCRIPT_TEXT_MAX,
      ),
    }))
    .filter((t) => t.text.trim())
    .slice(-HANDOFF_TRANSCRIPT_TURNS);
}
