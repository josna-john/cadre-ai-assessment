// Pages the bot can cite next to a sentence. The model writes a marker such as
// [[src:ai_strategy]] after a fact; the UI swaps it for a small link from this
// map. Unknown ids render nothing, so the model still never produces a URL
// (D18). The knowledge loader tags each KB section with the ids of its source
// URLs, so the model knows which id backs which fact. All URLs fetched on
// 2026-10-16 (HTTP 200, matching page titles).
//
// Shared by the server and the browser: no secrets.

// Case studies have no pages of their own: all are cards on /case-studies.
// A text fragment (#:~:text=) scrolls the browser to a phrase on the card and
// highlights it. Each phrase is from the card's first detail line, which
// appears once on the page (the headline also repeats in a summary near the
// top). Browsers without support just open the page. "-" and "," are fragment
// syntax, so they're percent-encoded. All 8 tested in Chromium (D17).
const caseStudy = (phrase: string) =>
  `https://cadre.ai/case-studies#:~:text=${encodeURIComponent(phrase).replace(/-/g, "%2D")}`;

export const SOURCES = {
  home: { label: "cadre.ai", href: "https://cadre.ai" },
  about: { label: "About Cadre", href: "https://cadre.ai/about" },
  contact: { label: "Contact", href: "https://cadre.ai/contact" },
  articles: { label: "Cadre articles", href: "https://cadre.ai/articles" },
  ai_strategy: { label: "AI Strategy", href: "https://cadre.ai/strategy" },
  transformation_intensive: {
    label: "AI Transformation Intensive",
    href: "https://cadre.ai/ai-transformation-intensive",
  },
  leadership_facilitation: { label: "Leadership & Facilitation", href: "https://cadre.ai/leadership-facilitation" },
  ai_engineering: { label: "AI Engineering", href: "https://cadre.ai/ai-engineering" },
  ai_agents: { label: "AI Agents", href: "https://cadre.ai/agents" },
  data_dashboards: { label: "Data & Dashboards", href: "https://cadre.ai/data-and-dashboards" },
  model_selection: { label: "AI model selection", href: "https://cadre.ai/articles/ai-model-selection" },
  openai_partner: {
    label: "OpenAI partnership",
    href: "https://cadre.ai/articles/cadre-ai-selected-as-an-official-openai-service-partner",
  },
  departments: { label: "Departments", href: "https://cadre.ai/departments" },
  client_portal: { label: "Client portal", href: "https://portal.gocadre.ai" },
  maturity_index: { label: "AI Maturity Index", href: "https://portal.gocadre.ai/ai-maturity-index" },
  case_studies: { label: "Case studies", href: "https://cadre.ai/case-studies" },
  // One page per industry, each listing the agents Cadre offers for it (D16).
  industries: { label: "Industries", href: "https://cadre.ai/industries" },
  industry_professional_services: {
    label: "Professional Services",
    href: "https://cadre.ai/industries/professional-services",
  },
  industry_private_equity: { label: "Private Equity", href: "https://cadre.ai/industries/private-equity" },
  industry_real_estate: { label: "Real Estate", href: "https://cadre.ai/industries/real-estate" },
  industry_financial_services: { label: "Financial Services", href: "https://cadre.ai/industries/financial-services" },
  industry_mortgage_lending: { label: "Mortgage & Lending", href: "https://cadre.ai/industries/mortgage-lending" },
  industry_construction: { label: "Construction", href: "https://cadre.ai/industries/construction" },
  industry_retail_ecommerce: { label: "Retail & E-commerce", href: "https://cadre.ai/industries/retail-e-commerce" },
  industry_manufacturing_logistics: {
    label: "Manufacturing & Logistics",
    href: "https://cadre.ai/industries/manufacturing-logistics",
  },
  industry_hospitality: { label: "Hospitality", href: "https://cadre.ai/industries/hospitality" },
  // One per case study, scrolled to its card (D17).
  case_study_lead_processing: {
    label: "Case study",
    href: caseStudy("1,500+ emails processed and 650+ leads"),
  },
  case_study_supplier_automation: { label: "Case study", href: caseStudy("Cut processing time by 60%") },
  case_study_proposal_automation: {
    label: "Case study",
    href: caseStudy("Cut proposal processing time by more than 50%"),
  },
  case_study_housing_visibility: { label: "Case study", href: caseStudy("replacing unmanageable Excel") },
  case_study_scheduling: { label: "Case study", href: caseStudy("Inspection Field Specialist capacity") },
  case_study_email_agent: { label: "Case study", href: caseStudy("Reduced manual email management") },
  case_study_loan_assistant: { label: "Case study", href: caseStudy("27 Loan Officers using daily") },
  case_study_voice_chat_agents: {
    label: "Case study",
    href: caseStudy("Appointment Requests processed automatically"),
  },
} as const;

export type SourceId = keyof typeof SOURCES;

export function isSourceId(id: string): id is SourceId {
  return Object.hasOwn(SOURCES, id);
}

// The marker the model writes after a sentence. A fixed, tiny grammar parsed
// against the allowlist above: the one place model text is pattern-matched,
// because citations have to sit inline and tool calls can't (D18).
export const SOURCE_MARKER = /\[\[src:([a-z0-9_]+)\]\]/g;

// A marker still streaming in ("[[src:ai_str"), hidden until it completes so
// the visitor never sees the raw syntax.
const PARTIAL_MARKER = /\[(\[(s(r(c(:[a-z0-9_]*)?)?)?)?\]?)?$/;

// Ids cited in a reply, in order, deduped, known ids only.
export function citedSources(text: string): SourceId[] {
  const ids = [...text.matchAll(SOURCE_MARKER)].map((m) => m[1]);
  return [...new Set(ids)].filter(isSourceId);
}

// Every marker id, known or not (the evals fail unknown ones).
export function markerIds(text: string): string[] {
  return [...text.matchAll(SOURCE_MARKER)].map((m) => m[1]);
}

// The reply as plain prose: for the team's transcript and for eval checks on
// wording and length.
export function stripMarkers(text: string): string {
  return text.replace(SOURCE_MARKER, "").replace(PARTIAL_MARKER, "").replace(/ +([.,;:!?])/g, "$1");
}

// Splits text into prose and citations for rendering. A trailing partial
// marker is dropped; an unknown id is dropped.
export function splitCitations(text: string): ({ kind: "text"; text: string } | { kind: "source"; id: SourceId })[] {
  const parts: ({ kind: "text"; text: string } | { kind: "source"; id: SourceId })[] = [];
  let last = 0;
  for (const m of text.matchAll(SOURCE_MARKER)) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    if (isSourceId(m[1])) parts.push({ kind: "source", id: m[1] });
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).replace(PARTIAL_MARKER, "");
  if (tail) parts.push({ kind: "text", text: tail });
  return parts;
}

// URL → id, so the knowledge loader can tag each section with its sources.
// Fragment links are excluded: those are cited per row in the case-study table.
const BY_URL = new Map<string, SourceId>(
  (Object.entries(SOURCES) as [SourceId, { href: string }][])
    .filter(([, s]) => !s.href.includes("#"))
    .map(([id, s]) => [s.href.replace(/\/$/, ""), id]),
);

export function sourceIdForUrl(url: string): SourceId | undefined {
  return BY_URL.get(url.replace(/[).,;]+$/, "").replace(/\/$/, ""));
}
