import { z } from "zod";

// Case studies have no pages of their own: all are cards on /case-studies.
// A text fragment (#:~:text=) scrolls the browser to a phrase on the card and
// highlights it. Each phrase is from the card's first detail line, which
// appears once on the page (the headline also repeats in a summary near the
// top). Browsers without support just open the page. "-" and "," are fragment
// syntax, so they're percent-encoded. All 8 tested in Chromium, 2026-10-16.
const caseStudy = (phrase: string) =>
  `https://cadre.ai/case-studies#:~:text=${encodeURIComponent(phrase).replace(/-/g, "%2D")}`;

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
  // The general fallback when no industry is named. Individual case studies
  // have no pages of their own (all are cards on this page; checked 2026-10-16).
  case_studies: { label: "See case studies", href: "https://cadre.ai/case-studies" },
  // One per case study, scrolled to its card. Shown when a reply cites that
  // case study's numbers, so the claim links to its source (D17).
  case_study_lead_processing: {
    label: "Case study: AI Lead Processing Agent",
    href: caseStudy("1,500+ emails processed and 650+ leads"),
  },
  case_study_supplier_automation: {
    label: "Case study: AI Supplier Automation",
    href: caseStudy("Cut processing time by 60%"),
  },
  case_study_proposal_automation: {
    label: "Case study: AI Proposal Automation",
    href: caseStudy("Cut proposal processing time by more than 50%"),
  },
  case_study_housing_visibility: {
    label: "Case study: AI Housing Visibility",
    href: caseStudy("replacing unmanageable Excel"),
  },
  case_study_scheduling: {
    label: "Case study: AI Scheduling System",
    href: caseStudy("Inspection Field Specialist capacity"),
  },
  case_study_email_agent: {
    label: "Case study: AI Email Agent",
    href: caseStudy("Reduced manual email management"),
  },
  case_study_loan_assistant: {
    label: "Case study: Loan Intelligence Assistant",
    href: caseStudy("27 Loan Officers using daily"),
  },
  case_study_voice_chat_agents: {
    label: "Case study: AI Voice & Chat Agents",
    href: caseStudy("Appointment Requests processed automatically"),
  },
  // One page per industry, each listing the agents Cadre highlights for it.
  // Shown instead of `case_studies` when a visitor names their industry.
  // Verified on cadre.ai on 2026-10-16 (all 9 in the sitemap, all 200).
  industry_professional_services: {
    label: "AI for Professional Services",
    href: "https://cadre.ai/industries/professional-services",
  },
  industry_private_equity: { label: "AI for Private Equity", href: "https://cadre.ai/industries/private-equity" },
  industry_real_estate: { label: "AI for Real Estate", href: "https://cadre.ai/industries/real-estate" },
  industry_financial_services: {
    label: "AI for Financial Services",
    href: "https://cadre.ai/industries/financial-services",
  },
  industry_mortgage_lending: { label: "AI for Mortgage & Lending", href: "https://cadre.ai/industries/mortgage-lending" },
  industry_construction: { label: "AI for Construction", href: "https://cadre.ai/industries/construction" },
  industry_retail_ecommerce: {
    label: "AI for Retail & E-commerce",
    href: "https://cadre.ai/industries/retail-e-commerce",
  },
  industry_manufacturing_logistics: {
    label: "AI for Manufacturing & Logistics",
    href: "https://cadre.ai/industries/manufacturing-logistics",
  },
  industry_hospitality: { label: "AI for Hospitality", href: "https://cadre.ai/industries/hospitality" },
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
  let unique = [...new Set(ids)];
  // An industry page replaces the generic case studies page (D16). The prompt
  // asks for this; this is the deterministic backstop.
  if (unique.some((id) => id.startsWith("industry_"))) unique = unique.filter((id) => id !== "case_studies");
  return unique.map((id) => ({ id, ...ACTIONS[id] }));
}
