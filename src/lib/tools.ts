import { tool } from "ai";
import { z } from "zod";
import { actionIdSchema, resolveActions } from "./actions";

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
};
