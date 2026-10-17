import { describe, expect, it } from "vitest";
import type { EvalCase } from "./cases";
import { score } from "./score";

const base: EvalCase = { id: "t", covers: "test", input: "" };
const ok = "Cadre AI is an AI strategy and implementation firm that helps businesses adopt AI.";

describe("score", () => {
  it("passes a clean reply with no case-specific checks", () => {
    expect(score(base, { text: ok, actions: [] })).toEqual([]);
  });

  it("checks includeAny groups case-insensitively", () => {
    const c = { ...base, includeAny: [["STRATEGY"], ["agents", "automation"]] };
    expect(score(c, { text: ok, actions: [] })).toEqual(["missing any of: agents | automation"]);
  });

  it("supports string and regex exclusions", () => {
    const c = { ...base, exclude: ["helps", /cadre (is|was) soc ?2/i] };
    expect(score(c, { text: ok + " Cadre is SOC 2 certified.", actions: [] })).toHaveLength(2);
  });

  it("checks required and any-of actions", () => {
    const c: EvalCase = { ...base, actionsAll: ["book_call"], actionsAny: ["email_team", "call_team"] };
    expect(score(c, { text: ok, actions: ["book_call", "call_team"] })).toEqual([]);
    expect(score(c, { text: ok, actions: [] })).toHaveLength(2);
  });

  it("flags links, emails, phone numbers and prices written into the text", () => {
    const text = ok + " Visit https://cadre.ai/contact, email hello@gocadre.ai, call (619) 324-3223. Plans start at $5,000.";
    expect(score(base, { text, actions: [] })).toEqual([
      "no URLs in text (links only via show_action)",
      "no email addresses in text",
      "no phone numbers in text",
      "no dollar amounts",
    ]);
  });

  it("flags talk of what Cadre does or doesn't publish", () => {
    const rule = "no talk of what is or isn't published";
    expect(score(base, { text: ok + " Cadre doesn't publish pricing.", actions: [] })).toEqual([rule]);
    expect(score(base, { text: ok + " I don't have a published turnaround time.", actions: [] })).toEqual([rule]);
    expect(score(base, { text: ok + " Pricing is something the team shares directly.", actions: [] })).toEqual([]);
  });

  it("flags replies that open with a limitation, not ones that mention it later", () => {
    const rule = "doesn't open with a limitation";
    expect(score(base, { text: "I can't see client accounts, but " + ok, actions: [] })).toEqual([rule]);
    expect(score(base, { text: "Unfortunately, " + ok, actions: [] })).toEqual([rule]);
    expect(score(base, { text: ok + " I can't see account data, so the team can help.", actions: [] })).toEqual([]);
    expect(score({ ...base, directAsk: true }, { text: "I can't see account data, but " + ok, actions: [] })).toEqual([]);
  });

  it("allows dollar amounts only when the case opts in", () => {
    const text = ok + " One client saved $420,000 per year.";
    expect(score({ ...base, allowDollarAmounts: true }, { text, actions: [] })).toEqual([]);
  });

  it("catches an answer written twice (the two-step regression)", () => {
    expect(score(base, { text: ok + " " + ok, actions: [] })).toContain("answer not duplicated");
  });

  it("checks handoff expectations and keeps personal details out of the summary", () => {
    const offer = { topic: "pricing" as const, summary: "Wants pricing for the Intensive." };
    expect(score({ ...base, handoff: ["pricing"] }, { text: ok, actions: [], handoff: offer })).toEqual([]);
    expect(score({ ...base, handoff: [] }, { text: ok, actions: [] })).toEqual(["missing handoff"]);
    expect(score({ ...base, handoff: ["security_compliance"] }, { text: ok, actions: [], handoff: offer })).toHaveLength(1);
    expect(score({ ...base, handoff: false }, { text: ok, actions: [], handoff: offer })).toEqual(["unexpected handoff: pricing"]);
    const leaky = { ...offer, summary: "Ada (ada@example.com) wants pricing." };
    expect(score(base, { text: ok, actions: [], handoff: leaky })).toEqual(["no personal details in handoff summary"]);
  });

  it("fails a reply cut off by the output-token cap, however short its text", () => {
    expect(score(base, { text: ok, actions: [], finishReason: "length" })).toEqual(["not cut off by the output-token cap"]);
    expect(score(base, { text: ok, actions: [], finishReason: "tool-calls" })).toEqual([]);
  });
});
