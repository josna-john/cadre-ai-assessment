import { tool } from "ai";
import { z } from "zod";
import { actionIdSchema, resolveActions } from "./actions";
import { clipSummary, handoffToolInputSchema } from "./handoff";

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
};
