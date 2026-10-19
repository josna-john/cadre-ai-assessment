import { describe, expect, it } from "vitest";
import { CONTACTS } from "./actions";
import { loadKnowledge } from "./knowledge";
import { INDUSTRIES, MAX_REPLIES, QUESTION_TEXT, cleanReplies, isRepliesOutput, missingQuestion } from "./replies";

const workflow = (replies: string[]) => cleanReplies({ question: "workflow", replies });
const industry = (replies: string[]) => cleanReplies({ question: "industry", replies });

describe("cleanReplies", () => {
  it("keeps short, distinct replies in the model's order", () => {
    expect(workflow(["Underwriting takes days", "Verifying income documents", "Client updates"])).toEqual([
      "Underwriting takes days",
      "Verifying income documents",
      "Client updates",
    ]);
  });

  it("trims whitespace and trailing punctuation, and dedupes ignoring case", () => {
    expect(workflow(["  Email   triage. ", "email triage", "Report generation?"])).toEqual(["Email triage", "Report generation"]);
  });

  it("drops links, emails, phone numbers, markers and prices", () => {
    expect(
      workflow([
        "Data entry",
        "Visit cadre.ai",
        "https://x.com",
        `Email ${CONTACTS.email}`,
        `Call ${CONTACTS.phone}`,
        "Call 619 324 3223",
        "6193243223",
        "[[contact:phone]]",
        "Budget is $5k",
        "About 10k dollars",
        "Email triage",
      ]),
    ).toEqual(["Data entry", "Email triage"]);
  });

  it("drops catch-alls: the chat box covers any other answer", () => {
    expect(
      workflow(["Data entry", "Other", "Something else", "None of these", "I'm not sure", "Email triage", "Answering other questions"]),
    ).toEqual(["Data entry", "Email triage", "Answering other questions"]);
  });

  it("drops overlong replies", () => {
    expect(workflow(["Data entry", "x".repeat(41), "Email triage"])).toEqual(["Data entry", "Email triage"]);
  });

  it(`keeps at most ${MAX_REPLIES}`, () => {
    expect(workflow(["a1", "b2", "c3", "d4", "e5", "f6"])).toHaveLength(MAX_REPLIES);
  });

  it("returns none when fewer than two survive: one chip isn't a choice", () => {
    expect(workflow(["Data entry", "Other"])).toEqual([]);
    expect(workflow([])).toEqual([]);
  });

  it("keeps industry chips to the knowledge's industries, under their KB names", () => {
    expect(industry(["Mortgage", "real estate", "Manufacturing and Logistics", "Healthcare"])).toEqual([
      "Mortgage & Lending",
      "Real Estate",
      "Manufacturing & Logistics",
    ]);
    // Two spellings of one industry are one chip.
    expect(industry(["Retail", "Retail & E-commerce", "Hospitality"])).toEqual(["Retail & E-commerce", "Hospitality"]);
    expect(industry(["Healthcare", "Education", "Hospitality"])).toEqual([]);
    // A chip is sent as the visitor's words, so it's never turned into a different answer.
    expect(industry(["Not real estate", "Private equity-backed retail", "Construction", "Hospitality"])).toEqual([
      "Construction",
      "Hospitality",
    ]);
  });
});

describe("INDUSTRIES", () => {
  it("matches the industries the knowledge names", () => {
    const line = loadKnowledge().match(/^- Industries: (.+)\.$/m)?.[1];
    expect(line?.split(", ")).toEqual([...INDUSTRIES]);
  });
});

describe("missingQuestion", () => {
  const chips = { question: "industry" as const, replies: ["Retail & E-commerce", "Hospitality"] };
  it("adds the question in code's words when the reply text doesn't ask one", () => {
    expect(missingQuestion("Cadre is an AI strategy firm.", chips)).toBe(QUESTION_TEXT.industry);
    expect(missingQuestion("Cadre is an AI strategy firm.", { ...chips, question: "workflow" })).toBe(QUESTION_TEXT.workflow);
  });
  it("adds nothing when the text asks, or there are no chips", () => {
    expect(missingQuestion("Which industry are you in?", chips)).toBeUndefined();
    expect(missingQuestion("Cadre is an AI strategy firm.", { ...chips, replies: [] })).toBeUndefined();
  });
});

describe("isRepliesOutput", () => {
  it("accepts the tool's output shape only", () => {
    expect(isRepliesOutput({ question: "industry", replies: ["a", "b"] })).toBe(true);
    expect(isRepliesOutput({ replies: ["a", "b"] })).toBe(false);
    expect(isRepliesOutput({ question: "pricing", replies: ["a", "b"] })).toBe(false);
    expect(isRepliesOutput({ question: "workflow", replies: [1] })).toBe(false);
    expect(isRepliesOutput(null)).toBe(false);
    expect(isRepliesOutput({})).toBe(false);
  });
});
