import type { ActionId } from "@/lib/actions";
import type { EvalCase } from "./cases";

export type BotReply = { text: string; actions: ActionId[] };

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
  return failures;
}
