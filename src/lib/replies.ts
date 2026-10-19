import { z } from "zod";

// Answer chips: short replies the visitor can tap when the bot ends on a
// discovery question (D23). The model writes the wording (it's language, and
// it has to fit the question), so code checks it the way it checks every
// other piece of model output that reaches the screen. Shared with the browser.

export const MAX_REPLIES = 4;
// Characters. A chip is a tap target, not a sentence: "Underwriting takes days"
// fits; anything much longer is a second message in disguise.
export const MAX_REPLY_CHARS = 40;

// Cadre's industries, exactly as knowledge/01-company.md names them (a test
// keeps the two in step). Industry chips are checked against this list, so a
// tap always names an industry the knowledge can answer for.
export const INDUSTRIES = [
  "Professional Services",
  "Private Equity",
  "Real Estate",
  "Financial Services",
  "Mortgage & Lending",
  "Construction",
  "Retail & E-commerce",
  "Manufacturing & Logistics",
  "Hospitality",
] as const;

// The two discovery questions (D20), and only those, get chips. Making the
// model name which one it's answering leaves no slot for menu chips under
// "Would you like to know more?" (eval reruns, 2026-10-19).
export const QUESTIONS = ["industry", "workflow"] as const;

// Loose on purpose: one bad chip shouldn't fail the whole tool call (and with
// it the reply's other tools). cleanReplies() drops what doesn't pass.
export const suggestRepliesInputSchema = z.object({
  question: z.enum(QUESTIONS),
  replies: z.array(z.string()).min(1).max(6),
});
export type SuggestRepliesInput = z.infer<typeof suggestRepliesInputSchema>;

// The same rules as reply text (CLAUDE.md rules 1 and 2): no links, emails,
// phone numbers (Cadre's own "(619) 324-3223" included: the model sees it in
// replayed button labels) or prices. A chip is sent as the visitor's own
// message, so one carrying these would put words in their mouth as well.
const CONTACT_OR_LINK = /https?:\/\/|www\.|\b\w+\.(ai|com|io|org|net)\b|[\w.+-]+@[\w-]+\.\w+|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\[\[/i;
const PRICE = /\$\s?\d|\b\d+\s?(k|usd|dollars)\b/i;
// The chat box is always there for an answer the chips don't cover, so a
// catch-all chip is a dead tap: it would send "Other" and nothing more.
const CATCH_ALL = /^other\b|\b(something else|none of (these|the above)|not sure)\b/i;

const normalize = (s: string) => s.toLowerCase().replace(/\s+and\s+/g, " & ").replace(/\s+/g, " ").trim();

// "Mortgage", "mortgage and lending" and "Mortgage & Lending" all become the
// knowledge's name; "Healthcare" becomes nothing. Only a whole name or one of
// its halves matches: a looser match turned "Not real estate" into "Real Estate".
function asIndustry(chip: string): string | undefined {
  const c = normalize(chip);
  return INDUSTRIES.find((name) => {
    const n = normalize(name);
    return n === c || n.split(" & ").includes(c);
  });
}

// Trims, drops unsafe, overlong and catch-all chips, keeps industry chips to
// the knowledge's industries, dedupes (ignoring case) and keeps at most
// MAX_REPLIES, in the model's order. Fewer than two left means there's no real
// choice to offer, so it returns none.
export function cleanReplies({ question, replies }: SuggestRepliesInput): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of replies) {
    let reply: string | undefined = raw.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
    if (!reply || reply.length > MAX_REPLY_CHARS || CONTACT_OR_LINK.test(reply) || PRICE.test(reply) || CATCH_ALL.test(reply)) continue;
    if (question === "industry") reply = asIndustry(reply);
    if (!reply || seen.has(reply.toLowerCase())) continue;
    seen.add(reply.toLowerCase());
    kept.push(reply);
  }
  return kept.length >= 2 ? kept.slice(0, MAX_REPLIES) : [];
}

// The two questions in code's words, matching the prompt's discovery questions.
export const QUESTION_TEXT: Record<SuggestRepliesInput["question"], string> = {
  industry: "What industry is your company in?",
  workflow: "Which manual work takes your team the most time today?",
};

// Chips need their question above them. The model sometimes picks the chips
// but leaves the question out of its text (4 of 12 eval reruns, 2026-10-19),
// and a tap would then answer nothing, so the UI adds the question in code's
// words. Returns it, or nothing when the text already asks one.
export function missingQuestion(replyText: string, chips: RepliesOutput): string | undefined {
  return chips.replies.length > 0 && !replyText.includes("?") ? QUESTION_TEXT[chips.question] : undefined;
}

export type RepliesOutput = { question: SuggestRepliesInput["question"]; replies: string[] };

// Tool output crosses the network as JSON, so check its shape before trusting it.
export function isRepliesOutput(output: unknown): output is RepliesOutput {
  if (!output || typeof output !== "object") return false;
  const { question, replies } = output as { question?: unknown; replies?: unknown };
  return (
    QUESTIONS.includes(question as RepliesOutput["question"]) &&
    Array.isArray(replies) &&
    replies.every((r) => typeof r === "string")
  );
}
