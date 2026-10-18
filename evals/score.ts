import { type ActionId, CONTACT_MARKER, isContactId } from "@/lib/actions";
import { citedSources, isSourceId, markerIds, stripMarkers } from "@/lib/sources";
import type { EvalCase } from "./cases";

import type { HandoffOffer } from "@/lib/handoff";

export type BotReply = { text: string; actions: ActionId[]; handoff?: HandoffOffer; finishReason?: string };

const SOURCE_TALK =
  /\bpublish(ed|es|ing)?\b|\bpublic information\b|\bknowledge base\b|\bmy (knowledge|information|notes)\b|\bmatching (case stud(y|ies)|results?)\b|\b(isn't|is not|aren't|are not|not) listed\b|\bdoesn't list\b|\blisted (industries|here)\b/i;

// "Would you like me to pass that along?" / "Can I send this to the team?":
// an offer of the form made in words. "Share" is left out on purpose, since
// offering to share more detail is fine.
const WORDED_HANDOFF_OFFER =
  /\b(?:(?:like|want) me to|shall I|should I)\s+(?:pass|send|forward|flag|hand)\b|\b(?:pass|send|forward)\b[^.?!]*\b(?:along|to (?:the|Cadre's) team)\b[^.?!]*\?/i;

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
  // "Use the button below" with no button is a dead end (off-topic, 2026-10-17).
  { name: "mentions a button only when one is shown", failed: (r) => /\bbuttons?\b/i.test(r.text) && r.actions.length === 0 && !r.handoff },
  // The form exists only if offer_handoff is called. Offered in words, a
  // visitor's "ok" had nothing to accept (partners, prod, 2026-10-17).
  { name: "offers a handoff only with the form", failed: (r) => !r.handoff && WORDED_HANDOFF_OFFER.test(r.text) },
  // Discovery: one question at a time, and none beside the form (D20).
  { name: "at most one question", failed: (r) => (r.text.match(/\?/g) ?? []).length > 1 },
  // Two questions sharing one "?" ("How many properties, and which area…?";
  // prod, 2026-10-17). A choice list ("pricing, guests or reporting?") is fine.
  { name: "question asks one thing", failed: (r) => /[^.!?\s]\s+(and|or)\s+(how|what|which|who|where|when|why|do|does|are|is|would)\b[^.!?]*\?/i.test(r.text) },
  { name: "no follow-up question alongside a handoff", failed: (r) => !!r.handoff && r.text.includes("?") },
  { name: "no personal details in handoff summary", failed: (r) => !!r.handoff && /[\w.+-]+@[\w-]+\.\w+|\d{3}[\s.-]\d{4}/.test(r.handoff.summary) },
];

function hasRepeatedOpening(text: string): boolean {
  const opening = text.trim().slice(0, 60);
  return opening.length === 60 && text.indexOf(opening, 1) > 0;
}

// Returns the list of failed checks. An empty list means pass. Names are
// human-readable so failures can be triaged without re-running.
export function score(c: EvalCase, raw: BotReply): string[] {
  const failures: string[] = [];
  // Wording and length checks read the prose the visitor sees; citation
  // markers are UI syntax (D18).
  const reply = { ...raw, text: stripMarkers(raw.text) };
  const lower = reply.text.toLowerCase();
  const sources = citedSources(raw.text);

  for (const check of UNIVERSAL) if (check.failed(reply, c)) failures.push(check.name);
  const unknown = markerIds(raw.text).filter((id) => !isSourceId(id));
  if (unknown.length) failures.push(`unknown source ids: ${unknown.join(", ")}`);
  const badContacts = [...raw.text.matchAll(CONTACT_MARKER)].map((m) => m[1]).filter((id) => !isContactId(id));
  if (badContacts.length) failures.push(`unknown contact ids: ${badContacts.join(", ")}`);
  for (const id of c.sourcesAll ?? []) {
    if (!sources.includes(id)) failures.push(`missing source: ${id}`);
  }
  if (c.cites && sources.length === 0) failures.push("cites no source");

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
  if (c.followUp === true && !reply.text.includes("?")) failures.push("asks no follow-up question");
  if (c.followUp === false && reply.text.includes("?")) failures.push("unexpected follow-up question");
  if (c.summaryIncludesAny && reply.handoff) {
    const summary = reply.handoff.summary.toLowerCase();
    if (!c.summaryIncludesAny.some((p) => summary.includes(p.toLowerCase()))) {
      failures.push(`handoff summary missing any of: ${c.summaryIncludesAny.join(" | ")}`);
    }
  }
  return failures;
}
