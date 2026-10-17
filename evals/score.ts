import type { ActionId } from "@/lib/actions";
import type { EvalCase } from "./cases";

import type { HandoffOffer } from "@/lib/handoff";

export type BotReply = { text: string; actions: ActionId[]; handoff?: HandoffOffer; finishReason?: string };

const SOURCE_TALK =
  /\bpublish(ed|es|ing)?\b|\bpublic information\b|\bknowledge base\b|\bmy (knowledge|information|notes)\b|\bmatching (case stud(y|ies)|results?)\b|\b(isn't|is not|aren't|are not|not) listed\b|\bdoesn't list\b|\blisted (industries|here)\b/i;

// Checks that apply to every reply, whatever the case: they encode CLAUDE.md's
// hard rules, so a regression in any case trips them.
const UNIVERSAL: { name: string; failed: (r: BotReply, c: EvalCase) => boolean }[] = [
  { name: "no URLs in text (links only via show_action)", failed: (r) => /https?:\/\/|www\.|\b\w+\.(ai|com)\/\S/i.test(r.text) },
  { name: "no email addresses in text", failed: (r) => /[\w.+-]+@[\w-]+\.\w+/.test(r.text) },
  { name: "no phone numbers in text", failed: (r) => /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(r.text) },
  { name: "no dollar amounts", failed: (r, c) => !c.allowDollarAmounts && /\$\s?\d/.test(r.text) },
  { name: "non-empty answer", failed: (r) => r.text.trim().length < 20 },
  // Guards against the two-step regression (answer written twice).
  { name: "answer not duplicated", failed: (r) => hasRepeatedOpening(r.text) },
  { name: "concise (≤ 1,200 chars)", failed: (r) => r.text.length > 1200 },
  // A reply that hits maxOutputTokens stops mid-sentence and can lose its tool
  // calls, even when the visible text is short enough to pass the check above.
  { name: "not cut off by the output-token cap", failed: (r) => r.finishReason === "length" },
  // The bot speaks as a Cadre insider. Talk of what's "published", "listed",
  // "matching" or in its "knowledge base" sounds evasive or like reading notes.
  { name: "doesn't talk about its sources", failed: (r) => SOURCE_TALK.test(r.text) },
  // Opening with "I can't…" makes Cadre look evasive; lead with the help.
  // Exempt when the visitor directly asked for the thing (see `directAsk`).
  { name: "doesn't open with a limitation", failed: (r, c) => !c.directAsk && /^\W*(I can't|I cannot|I can not|I don't have|I do not have|I'm not able|I am not able|I'm unable|I am unable|Unfortunately|Sorry)\b/i.test(r.text) },
  // The handoff form is the lead capture; a booking button beside it competes.
  { name: "no book_call alongside a handoff", failed: (r) => !!r.handoff && r.actions.includes("book_call") },
  { name: "no personal details in handoff summary", failed: (r) => !!r.handoff && /[\w.+-]+@[\w-]+\.\w+|\d{3}[\s.-]\d{4}/.test(r.handoff.summary) },
];

function hasRepeatedOpening(text: string): boolean {
  const opening = text.trim().slice(0, 60);
  return opening.length === 60 && text.indexOf(opening, 1) > 0;
}

// Returns the list of failed checks. An empty list means pass. Names are
// human-readable so failures can be triaged without re-running.
export function score(c: EvalCase, reply: BotReply): string[] {
  const failures: string[] = [];
  const lower = reply.text.toLowerCase();

  for (const check of UNIVERSAL) if (check.failed(reply, c)) failures.push(check.name);

  for (const group of c.includeAny ?? []) {
    if (!group.some((p) => lower.includes(p.toLowerCase()))) failures.push(`missing any of: ${group.join(" | ")}`);
  }
  for (const pattern of c.exclude ?? []) {
    const hit = typeof pattern === "string" ? lower.includes(pattern.toLowerCase()) : pattern.test(reply.text);
    if (hit) failures.push(`contains excluded: ${pattern}`);
  }
  for (const action of c.actionsAll ?? []) {
    if (!reply.actions.includes(action)) failures.push(`missing action: ${action}`);
  }
  if (c.actionsAny && !c.actionsAny.some((a) => reply.actions.includes(a))) {
    failures.push(`missing any action of: ${c.actionsAny.join(" | ")}`);
  }
  for (const action of c.actionsNone ?? []) {
    if (reply.actions.includes(action)) failures.push(`unexpected action: ${action}`);
  }
  if (c.handoff === false && reply.handoff) failures.push(`unexpected handoff: ${reply.handoff.topic}`);
  if (Array.isArray(c.handoff)) {
    if (!reply.handoff) failures.push("missing handoff");
    else if (c.handoff.length && !c.handoff.includes(reply.handoff.topic)) {
      failures.push(`handoff topic ${reply.handoff.topic}, expected one of: ${c.handoff.join(" | ")}`);
    }
  }
  return failures;
}
