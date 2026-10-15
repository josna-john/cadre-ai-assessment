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

  it("allows dollar amounts only when the case opts in", () => {
    const text = ok + " One client saved $420,000 per year.";
    expect(score({ ...base, allowDollarAmounts: true }, { text, actions: [] })).toEqual([]);
  });

  it("catches an answer written twice (the two-step regression)", () => {
    expect(score(base, { text: ok + " " + ok, actions: [] })).toContain("answer not duplicated");
  });
});
