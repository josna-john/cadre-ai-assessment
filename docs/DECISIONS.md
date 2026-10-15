# Decisions & Trade-offs

One entry per meaningful architectural choice: what was chosen, what was rejected, and why.

## Template
### D#: Title
- **Context:** what problem or constraint forced the decision
- **Decision:** what we chose
- **Alternatives considered:** what we rejected and why
- **Trade-off / cost:** what we gave up
- **Revisit when:** the condition that would change this

---

## Log
### D1: Knowledge base in the prompt, not RAG
- **Context:**
  - The bot must answer only true things about Cadre.
  - Cadre's public site gives about 5 pages of distinct facts (services, industries, contact, portal, Maturity Index, security claims, case studies).
- **Decision:**
  - Hand-curated markdown in `knowledge/`, with a source URL on every fact, loaded whole into the system prompt.
  - Facts are researched by a subagent and reviewed by a human before commit.
- **Alternatives considered:** RAG with Supabase pgvector. Rejected because the corpus fits easily in context, retrieval adds a failure mode (wrong chunk) and latency, and there's nothing to gain at this size.
- **Trade-off / cost:** Every request pays input tokens for the whole KB. Prompt caching and Haiku pricing keep this small. Real cost per turn will be measured and recorded here.
- **Revisit when:** the KB outgrows a comfortable share of the context window, or Cadre wants per-client or private documents (then RAG with access control).

### D2: OpenRouter + Claude Haiku 5.5 for the chatbot
- **Context:** The provided key is OpenRouter with a $5 hard limit, shared by dev, evals and public traffic.
- **Decision:**
  - `anthropic/claude-haiku-5.5` via `@openrouter/ai-sdk-provider` (OpenRouter's official AI SDK 7 provider), configured in one place (`src/lib/ai.ts`).
  - OpenRouter usage accounting is on, so every call logs its real dollar cost.
- **Alternatives considered:**
  - Sonnet 5.5: better prose, several times the cost per turn.
  - `@ai-sdk/openai-compatible`: works, but loses OpenRouter's cost reporting.
  - Vercel AI Gateway: not the provided key.
- **Trade-off / cost:** Haiku may phrase things less richly. The eval set decides whether that matters.
- **Measured:** the health check (about 290 tokens) took 2.6 s and cost $0.000037.
- **Revisit when:** evals show quality failures that prompt changes can't fix. Swapping the model is a one-string change.

### D3: The model picks actions; code owns URLs
- **Context:**
  - A support bot that writes a wrong link or a made-up booking page does real damage.
  - Research found Cadre has no public calendar, so "book a call" means the contact form.
- **Decision:** The model calls `show_action` with a fixed enum (`book_call`, `maturity_index`, `client_portal`, `email_team`). `src/lib/actions.ts` maps each value to a URL, and the UI renders a button.
- **Alternatives considered:** Putting URLs in the prompt and letting the model write them. That's simpler, but the model can still garble or invent them, and you can't test them deterministically.
- **Trade-off / cost:** One more tool and some UI work.
- **Revisit when:** links need personalization (e.g. pre-filled forms).

### D4: Escalation is a consented, structured handoff stored in Supabase
- **Context:** "A user asking a question the bot can't answer — and needs to escalate or redirect." Cadre's site already has a contact form, and the bot links to it (`book_call`). But sending a visitor there means they leave the chat, retype their question, and the team gets a cold note with no context or routing.
- **Decision:** a two-step handoff where the model never touches contact details.
  1. The model calls `offer_handoff` with a topic from a fixed enum (`pricing`, `security_compliance`, `portal_access`, `account_specific`, `partnership_legal`, `other`) and a one-sentence, third-person summary. The UI renders a short form. Nothing is saved yet.
  2. The visitor types their own name and email and clicks send. `POST /api/handoff` validates with zod, with no LLM involved, and saves to a Supabase `handoffs` table along with the last 10 turns of transcript.
- **Why this shape:**
  - Consent is an explicit click, not the model's reading of "sure".
  - The model can't mistype or invent an email address.
  - The confirmation message is deterministic UI, so D5's single model step still holds.
  - Every row is tagged, so the team can route it (sales, security, client success) and see where the bot has knowledge gaps.
- **Security:**
  - The table has RLS on with no policies, and grants are revoked from `anon` and `authenticated`. Only the server's secret key can read or write it. Verified: the publishable key gets `permission denied`.
  - Logs carry the handoff id and topic only, never contact details.
  - A honeypot field silently drops basic bots.
  - Rate limiting comes in Phase 4.
  - The transcript comes from the browser, so it's visitor-supplied context, not proof of what the bot said.
  - Requests over 32 KB are refused before parsing. Strings that Postgres would reject (NUL characters, half an emoji) are caught or cleaned in validation, so they come back as a 400 rather than a 503.
- **Out of scope:** notifying anyone. Rows land in the table and nothing emails the team. So the confirmation says "We've passed your question to Cadre's team" and makes no promise about a reply.
- **Alternatives considered:**
  - Redirect to the contact form only: no infra, but the context is lost and the visitor has to switch pages.
  - The model collects name and email in chat and calls a save tool: fewer UI parts, but consent is implicit, emails get mistyped, and contact details end up in model logs.
  - Logging gaps only, with no contact details: useful analytics, but no follow-up.
- **Provisioning:** Supabase comes from the Vercel Marketplace on the project's own team (env vars injected automatically). The schema lives in `supabase/migrations/`.
- **Revisit when:** this goes live for Cadre. `saveHandoff()` in `src/lib/handoff-store.ts` is the single seam to replace with their CRM (HubSpot or Salesforce) or an inbound-inbox notification. Supabase stands in for that system here, and nobody at Cadre watches this table.

### D5: Single-step tool calls (answer and buttons in one model call)
- **Context:** With `stopWhen: isStepCount(2)`, Haiku wrote its answer, called `show_action`, then rewrote the whole answer after the tool result. Users saw the text twice, and each turn cost about $0.0014 (13k input tokens).
- **Decision:**
  - `isStepCount(1)`: the model writes the answer and calls `show_action` in the same response, then the stream ends.
  - The prompt tells the model to put the full answer before the tool call.
- **Result (measured locally):**
  - No duplicate text.
  - About 6.4k input tokens and $0.00077 per turn, 2.0–2.7 s.
  - That's roughly 6,500 turns on the $5 budget.
- **Trade-off:** the model can't react to a tool's result in the same turn. That's fine for `show_action`, which is pure presentation. The handoff kept this intact: its confirmation is rendered by the form, not written by the model (D4).

### D6: Source URLs live in HTML comments, stripped before the prompt
- **Decision:** Each fact in `knowledge/*.md` carries its source as `<!-- src: … -->`. `loadKnowledge()` strips comments, and a unit test asserts the model-facing KB contains no URLs or emails.
- **Why:** Facts stay traceable for maintainers and reviewers. The model never sees a raw link it could repeat (that's D3's guarantee, enforced by a test instead of by prompt wording), and the prompt is smaller.

## Eval log
| Date | SHA | Model | Pass rate | Cost | Notes |
|---|---|---|---|---|---|
| 2026-10-15 | (Phase 1–2) | claude-haiku-5.5 | 18/18 | $0.0140 | First run. p50 2.4 s, p95 3.0 s, about $0.00078/turn. Some "defers" phrases are lenient; tighten them once handoffs land |
| 2026-10-15 | (Phase 3) | claude-haiku-5.5 | 19/20 → 20/20 | $0.0177 | Added `offer_handoff`, plus 2 cases and handoff expectations (required on escalations, forbidden on happy paths). The one failure was the scorer, not the bot: "aren't among the industries" wasn't in the phrase list. p50 2.1 s, p95 3.0 s, about $0.00084/turn. Re-run after the review fixes (generated topic list, clipped summary): 20/20, $0.0169 |

---

## Next steps & scaling
Updated during the build.
- **Reliability:** 
- **Scale / cost:** 
- **Quality / evals:** 
- **Security / data privacy:** 
- **Rollout / adoption:** 
