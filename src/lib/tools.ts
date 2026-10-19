import { tool } from "ai";
import { z } from "zod";
import { actionIdSchema, resolveActions } from "./actions";
import { clipSummary, handoffToolInputSchema } from "./handoff";
import { cleanReplies, suggestRepliesInputSchema } from "./replies";

// Tools the chat model can call. Each one does deterministic work; the model
// only decides *when* to use it and with which enum values.
export const chatTools = {
  show_action: tool({
    description:
      "Show the visitor 1-3 buttons for next steps (booking a call, the AI Maturity Index, the client portal, case studies, or contacting the team). Use this instead of writing any URL, email address or phone number.",
    inputSchema: z.object({
      actions: z.array(actionIdSchema).min(1).max(3),
    }),
    execute: async ({ actions }) => ({ actions: resolveActions(actions) }),
  }),
  // Only *offers* a handoff: the UI renders a form, and the visitor's own
  // submit saves it (src/lib/handoff.ts). The model never sees contact details.
  offer_handoff: tool({
    description:
      "Show the visitor a short form to send their question to Cadre's team, who follow up by email. Use when you can't answer (pricing, security documents, account or portal problems, contracts) or the visitor asks for a person. The summary is a one-sentence, third-person description of what they need, with no personal details.",
    inputSchema: handoffToolInputSchema,
    execute: async ({ topic, summary }) => ({ topic, summary: clipSummary(summary) }),
  }),
  // Answer chips for the reply's follow-up question (D23). The UI shows them
  // under the latest reply and a tap sends the chip as the visitor's message;
  // the chat box stays open for any other answer. Code drops unsafe or overlong ones.
  suggest_replies: tool({
    description:
      "Show 2-4 short answers the visitor can tap to reply to the discovery question your reply text ends with. The chips show only the answers, never the question, so the question must be written out as the last sentence of your reply text. `question` says which one you asked: \"industry\" (their industry isn't known yet) or \"workflow\" (they've told you their industry; you asked which manual work takes the most time). Each answer is a few words in the visitor's voice, taken from options the knowledge covers.",
    inputSchema: suggestRepliesInputSchema,
    execute: async (input) => ({ question: input.question, replies: cleanReplies(input) }),
  }),
};
