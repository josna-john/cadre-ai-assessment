import { z } from "zod";

// The only links the chatbot can show. The model picks action ids via the
// `show_action` tool; this map turns them into URLs, so a hallucinated or
// mistyped link is impossible. All URLs verified on cadre.ai on 2026-10-15.
export const ACTIONS = {
  // Cadre has no public calendar: every "Talk to an AI Strategist" CTA on the
  // site goes to the contact form.
  book_call: { label: "Talk to an AI strategist", href: "https://cadre.ai/contact" },
  maturity_index: {
    label: "Get your AI Maturity Index",
    href: "https://portal.gocadre.ai/ai-maturity-index",
  },
  client_portal: { label: "Open the client portal", href: "https://portal.gocadre.ai" },
  case_studies: { label: "See case studies", href: "https://cadre.ai/case-studies" },
  email_team: { label: "Email hello@gocadre.ai", href: "mailto:hello@gocadre.ai" },
  call_team: { label: "Call (619) 324-3223", href: "tel:+16193243223" },
} as const;

export const actionIdSchema = z.enum(
  Object.keys(ACTIONS) as [keyof typeof ACTIONS, ...(keyof typeof ACTIONS)[]],
);
export type ActionId = z.infer<typeof actionIdSchema>;

export type ResolvedAction = { id: ActionId; label: string; href: string };

export function resolveActions(ids: ActionId[]): ResolvedAction[] {
  // Dedupe while keeping the model's order.
  return [...new Set(ids)].map((id) => ({ id, ...ACTIONS[id] }));
}
