# Brief

Received 2026-10-15. Source: *Cadre AI Chatbot Take-Home, Candidate Guide v1.1*, plus the cover email. Product and deliverable sections are quoted verbatim below. Process and logistics sections are left out.

## The Brief
> You have been brought in to build a customer support chatbot for Cadre AI.
>
> Cadre AI is an AI strategy and implementation consultancy. We help businesses move from AI confusion to AI confidence — going department by department to identify high-ROI AI opportunities, build workflows and agents, and train teams so the changes actually stick. Our clients range from lower middle market private equity-backed companies to professional services firms and financial services organizations.
>
> Cadre's inbound team is receiving a growing volume of inquiries from prospective clients, existing clients, and people who want to learn more about what we do. Your job is to build a chatbot that handles the most common interactions so the team can focus on high-value conversations.

## About Cadre AI
| Item | Detail |
|---|---|
| What we do | AI strategy, workflow automation, AI agents, and leadership facilitation for businesses |
| Who we serve | B2B companies: professional services, private equity, financial services, real estate, construction, manufacturing, retail, and more |
| Core services | AI Strategy, AI Leadership & Facilitation, AI Engineering, AI Agents |
| Key partners | OpenAI, Anthropic (Claude), Google, Microsoft, AWS, Salesforce, Snowflake — plus OpenRouter for model access |
| Common inquiries | What does Cadre AI do, how to get started, service pricing, AI Maturity Index, case studies, how to book a strategy call, what industries we work in |

## What to Build
> Build a customer support chatbot for Cadre AI that can handle common inbound inquiries. The prompt is intentionally underspecified — how you scope and prioritize is part of the evaluation.
>
> **Minimum bar:** a functional chatbot that a prospective or existing Cadre AI client could plausibly use to get answers. Everything beyond that is your call.
>
> Some scenarios the bot should be able to handle (treat this as a starting point, not an exhaustive spec):
> - A prospective client asking what Cadre AI does and whether we work with their industry
> - Someone asking how to book a call with an AI strategist
> - A client asking how to access the Cadre portal to track their AI tools, agents, and results
> - A business leader asking what the AI Maturity Index is and how to get scored
> - Someone asking about Cadre's approach to LLM selection and data security
> - A user asking a question the bot can't answer — and needs to escalate or redirect
>
> You decide what the bot knows. You decide where it draws the line. You decide what's in scope.

## Deliverables
> - A deployed, publicly accessible URL of your chatbot
> - Upload a zip of your complete project … Exclude dependency folders like node_modules, dist, build, or your virtual environment before zipping.
> - A CLAUDE.md at the root of the project
> - A plan.md at the root of the project
> - Include your .git folder in the zip.

## Constraints (from the cover email)
- The chatbot's LLM is reached through a provided **OpenRouter** API key. The key has a **$5 budget** and is for the chatbot only. Any model available on OpenRouter may be used.
- No required tech stack. "The only requirement is that it deploys and works on a public URL."
- Which LLM to use is our call and should be justified.
