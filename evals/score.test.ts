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

  it("fails an action the case forbids", () => {
    const c: EvalCase = { ...base, actionsNone: ["case_studies"] };
    expect(score(c, { text: ok, actions: ["book_call"] })).toEqual([]);
    expect(score(c, { text: ok, actions: ["case_studies"] })).toEqual(["unexpected action: case_studies"]);
  });

  it("checks citations, and scores wording on the prose without markers", () => {
    const cited = "Cadre runs a 45-day AI Transformation Intensive.[[src:transformation_intensive]]";
    expect(score({ ...base, sourcesAll: ["transformation_intensive"], cites: true }, { text: cited, actions: [] })).toEqual([]);
    expect(score({ ...base, cites: true }, { text: ok, actions: [] })).toEqual(["cites no source"]);
    expect(score({ ...base, sourcesAll: ["ai_agents"] }, { text: cited, actions: [] })).toEqual(["missing source: ai_agents"]);
    expect(score(base, { text: ok + "[[src:made_up]]", actions: [] })).toEqual(["unknown source ids: made_up"]);
    // A marker doesn't count toward the opening or exact-phrase checks.
    expect(score({ ...base, includeAny: [["intensive."]] }, { text: cited, actions: [] })).toEqual([]);
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

  it("flags talk about the bot's sources", () => {
    const rule = "doesn't talk about its sources";
    expect(score(base, { text: ok + " One matching result is the Loan Intelligence Assistant.", actions: [] })).toEqual([rule]);
    expect(score(base, { text: ok + " Healthcare isn't one of Cadre's listed industries.", actions: [] })).toEqual([rule]);
    expect(score(base, { text: ok + " That isn't in my knowledge base.", actions: [] })).toEqual([rule]);
    expect(score(base, { text: ok + " For a mortgage lender, Cadre built a Loan Intelligence Assistant.", actions: [] })).toEqual([]);
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

  it("checks follow-up questions: one at a time, none beside the form", () => {
    const asks = ok + " What takes your team the most time today?";
    expect(score({ ...base, followUp: true }, { text: asks, actions: [] })).toEqual([]);
    expect(score({ ...base, followUp: true }, { text: ok, actions: [] })).toEqual(["asks no follow-up question"]);
    expect(score({ ...base, followUp: false }, { text: asks, actions: [] })).toEqual(["unexpected follow-up question"]);
    expect(score(base, { text: asks + " And how big is it?", actions: [] })).toEqual(["at most one question"]);
    const compound = ok + " How many properties do you have, and which area takes the most time?";
    expect(score(base, { text: compound, actions: [] })).toEqual(["question asks one thing"]);
    const choice = ok + " Which takes the most time: pricing, guest communications or reporting?";
    expect(score(base, { text: choice, actions: [] })).toEqual([]);
    const offer = { topic: "pricing" as const, summary: "Wants pricing for a 12-hotel group." };
    expect(score(base, { text: asks, actions: [], handoff: offer })).toEqual(["no follow-up question alongside a handoff"]);
    expect(score({ ...base, summaryIncludesAny: ["hotel"] }, { text: ok, actions: [], handoff: offer })).toEqual([]);
    expect(score({ ...base, summaryIncludesAny: ["mortgage"] }, { text: ok, actions: [], handoff: offer })).toEqual([
      "handoff summary missing any of: mortgage",
    ]);
  });

  it("checks contact markers and button mentions", () => {
    expect(score(base, { text: ok + " Call the team at [[contact:phone]].", actions: ["call_team"] })).toEqual([]);
    expect(score(base, { text: ok + " Fax us at [[contact:fax]].", actions: ["call_team"] })).toEqual(["unknown contact ids: fax"]);
    expect(score(base, { text: ok + " Use the button below.", actions: [] })).toEqual(["mentions a button only when one is shown"]);
    expect(score(base, { text: ok + " Use the button below.", actions: ["book_call"] })).toEqual([]);
  });

  it("fails a reply cut off by the output-token cap, however short its text", () => {
    expect(score(base, { text: ok, actions: [], finishReason: "length" })).toEqual(["not cut off by the output-token cap"]);
    expect(score(base, { text: ok, actions: [], finishReason: "tool-calls" })).toEqual([]);
  });
});
