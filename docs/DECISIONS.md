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
  - Rate limited: 5 submissions per 10 minutes per visitor, plus the edge rule (D8).
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

### D7: Prompt caching on the system prompt
- **Context:** a usage probe showed `cacheReadTokens: 0`. Every turn re-sent the same ~6.9k-token prefix (tool definitions, rules and the KB) at full price. That prefix is about 90% of each turn's cost.
- **Decision:** pass the prompt through AI SDK 7's `instructions` option (`system` is deprecated) as a system message with `providerOptions.openrouter.cacheControl: { type: "ephemeral" }`. Anthropic caches everything up to that breakpoint: the tools plus the system prompt.
- **Result (measured):**

  | Turn | Cost |
  |---|---|
  | No caching (before) | $0.00076 |
  | First turn, writes the cache (1.25× input) | $0.00092 |
  | Later turns within the ~5-minute TTL, read the cache (0.1× input) | **$0.00030** |

  At steady traffic, the $5 covers about 15,000 turns, up from about 6,500.
- **Trade-off:** a turn after 5 idle minutes pays the write premium (+22%). That's a net win at more than one turn per 5 minutes. Any edit to the prompt or KB invalidates the cache, which is expected.
- **Also checked:** `reasoningTokens: 0`, so no hidden thinking is billed. The ~1.4 KB `reasoning_details` signature that OpenRouter attaches to each reply is stripped from replayed history (`chat-request.ts`), so it doesn't use up the history size cap.

### D8: Rate limiting at the edge, plus a per-visitor cap on handoffs
- **Context:** both endpoints are public. `/api/chat` spends the $5 LLM budget, and `/api/handoff` writes to the database.
- **Decision:**
  - **Edge:** a Vercel Firewall rule caps `POST /api/*` at **20 requests per 60 s per IP** (fixed window, returns 429). It runs before the function, so throttled requests cost nothing. The UI maps a 429 to "You're sending messages quickly…".
  - **Handoffs:** at most **5 per 10 minutes per visitor**, checked in `saveHandoff()` against the table. The visitor is identified by an HMAC of the client IP, never the raw IP.
  - **Backstop:** the OpenRouter key's hard $5 limit. In the worst case the bot stops answering (a defined error state). The bill can't grow.
- **Why not more firewall rules:** the Hobby plan allows **one** rate-limit rule. We tried an hourly chat cap and a separate handoff rule, and the API refused them ("Rate limiting is not available for this plan"). So the one rule covers all POST routes, and the stricter handoff cap lives in code.
- **Reproduce:**
  ```
  vercel firewall rules add "API POST limit" --condition '{"type":"path","op":"pre","value":"/api/"}' \
    --condition '{"type":"method","op":"eq","value":"POST"}' --action rate_limit \
    --rate-limit-requests 20 --rate-limit-window 60 --rate-limit-keys ip --yes
  vercel firewall publish --yes
  ```
- **Trade-offs:**
  - The handoff check is count-then-insert, so a burst of parallel requests can slip one or two over the cap. That's acceptable for spam control.
  - The IP hash is keyed with the Supabase secret, so rotating that key resets the counts. That's harmless.
  - Visitors behind one NAT (an office) share the 20/min limit, which is still far above human typing speed.
  - IPv6 visitors are counted by their /64 prefix, since one client usually controls the whole block.
- **Model-swap caveat (D7):** the stripped `reasoning_details` aren't needed for Haiku without thinking. If you enable reasoning or switch to Gemini, those providers need the signatures replayed, so remove the strip and allow `reasoning` parts.
- **Revisit when:** on Pro, add an hourly per-IP chat cap (e.g. 120/hour), and consider a global daily spend alarm built on the `chat.turn` cost logs.

### D9: Hidden reasoning off for the chat model
- **Context:**
  - The `data-security` eval hit the 600-token output cap (`finishReason: length`) and lost its tool call, even though its visible text was only 94 words.
  - A usage probe showed why: **421 of the 600 output tokens were `reasoningTokens`**, against 179 text tokens.
  - D7 had recorded `reasoningTokens: 0` on 2026-10-15. So Haiku 5.5 either now reasons by default through OpenRouter, or reasons only on some questions.
- **Decision:** `extraBody: { reasoning: { enabled: false } }` on the model in `src/lib/ai.ts`.
- **Why:**
  - The job is grounded lookup from a fixed, in-prompt KB. It doesn't need multi-step thinking.
  - Reasoning tokens are billed as output and were most of the output cost of that turn.
  - They also count toward `maxOutputTokens`, so they can silently cut off replies.
- **Result (measured, full eval):**

  | | Reasoning on | Reasoning off |
  |---|---|---|
  | Typical reply time (p50) | 2.3 s | 1.9–2.0 s |
  | Run cost | $0.0056 | $0.0037–0.0044 |
  | `data-security` | cut off | finishes, with its handoff |

- **What it exposed:** with reasoning off, `url-bait` copied "hello@gocadre.ai" into its reply. The cause was the prompt itself: it listed the `email_team` button label ("Email hello@gocadre.ai") right after the "never write emails" rule. Labels are now stripped of emails and phone numbers before they reach the prompt, and a unit test asserts the **full** built prompt has no email, phone number or URL (D6's test only covered the KB).
- **Guardrails added:** a universal eval check fails any reply cut off by the output cap, whatever its text length.
- **Alternatives considered:**
  - Raise `maxOutputTokens`: it treats the symptom, raises the cost per turn, and leaves latency high.
  - Cap reasoning at a token budget: a middle ground, but the evals show no quality loss with it fully off.
- **Revisit when:** evals show reasoning-shaped failures (multi-constraint questions answered wrongly). If reasoning goes back on, see D8's note on replaying `reasoning_details`.

### D10: The handoff form is a complete lead, matching Cadre's contact form
- **Context:**
  - Cadre's own form (cadre.ai/contact) requires first name, last name, company name, work email and a message, and has an optional phone field.
  - The original handoff form (D4) asked only for name and email. So a handoff wasn't a usable lead, and a prospect could end up filling in both forms.
  - Replies often showed a "Talk to an AI strategist" button right under the form: two ways to reach the same team.
- **Decision:**
  - The form now collects the same fields as Cadre's contact form, with the same required set, marked with a red \* as on cadre.ai.
  - The model's third-person summary stands in for the "How can we help you?" message. It's shown read-only as "What we'll send the team", because as an editable field the visitor would read it as their own words. "Anything to add?" stays optional.
  - When a reply offers a handoff, the prompt says not to also show `book_call`. The UI drops it as a deterministic backstop, and an eval check enforces it. The header CTA stays as the always-available route.
- **Schema:** additive migration (`20261016190000_handoffs_lead_fields.sql`) with nullable `first_name`, `last_name` and `phone` columns. `name` keeps "first last", so code deployed before the migration and existing rows keep working. Required fields are enforced in zod, not with `NOT NULL`, for the same reason.
- **Trade-off:** more required fields mean slightly more friction than name and email alone. Accepted, because a handoff that sales can't act on has little value, and the fields match what Cadre already asks for.
- **Revisit when:** the CRM swap (D4). Map these fields straight onto the CRM contact.

### D11: Streaming is smoothed server-side and faded in client-side
- **Context:** the provider streams text in uneven bursts, so replies jumped in several words at a time.
- **Decision:**
  - `experimental_transform: smoothStream({ chunking: "word", delayInMs: 12 })` in `streamChat`, so text leaves the server one word at a time at a steady pace.
  - In the browser, `Markdown.tsx` wraps each word in a span that fades in on mount. Keys are positional, so only new words animate.
  - Everything respects `prefers-reduced-motion`.
- **Measured:** a 121-word reply arrived with a median gap of 17 ms between words and no bursts, in about 2.1 s.
- **Trade-off:** the smoothing adds up to about 12 ms per word when the model is faster than that pace, which is about 1–2 s on a long reply. It's covered by the existing timeout and has no token cost. Evals run the same path.
- **Revisit when:** replies get much longer, or latency becomes the complaint. Lower `delayInMs`, or chunk by line.

## Eval log
| Date | SHA | Model | Pass rate | Cost | Notes |
|---|---|---|---|---|---|
| 2026-10-15 | (Phase 1–2) | claude-haiku-5.5 | 18/18 | $0.0140 | First run. p50 2.4 s, p95 3.0 s, about $0.00078/turn. Some "defers" phrases are lenient; tighten them once handoffs land |
| 2026-10-15 | (Phase 3) | claude-haiku-5.5 | 19/20 → 20/20 | $0.0177 | Added `offer_handoff`, plus 2 cases and handoff expectations (required on escalations, forbidden on happy paths). The one failure was the scorer, not the bot: "aren't among the industries" wasn't in the phrase list. p50 2.1 s, p95 3.0 s, about $0.00084/turn. Re-run after the review fixes (generated topic list, clipped summary): 20/20, $0.0169 |
| 2026-10-15 | (Phase 4) | claude-haiku-5.5 | 20/20 | $0.0055 | Prompt caching on (D7): one cache write ($0.00098), then about $0.00021 per turn, so the whole run cost 67% less. p50 2.1 s. p95 7.6 s comes from one outlier (`portal-login-problem`); every other case was under 3.5 s. Watch it, likely provider variance |
| 2026-10-16 | (pre-29c8025) | claude-haiku-5.5 | 20/20 | $0.0047 | System prompt now names the bot "Ask Cadre"; `smoothStream` re-chunks output word by word (12 ms). Prompt cache warm on every turn, about $0.00023/turn. p50 2.4 s, p95 3.9 s. `data-security` passed but hit the 600-token output cap (`finishReason: length`, no tool call), so that reply is likely cut off. Follow up: tighten the answer or raise the cap with a reason |
| 2026-10-16 | (pre-29c8025) | claude-haiku-5.5 | 19/20 | $0.0056 | Style rules (under about 120 words, no "published commitments" hedging), no `book_call` beside a handoff, and a new check that fails any reply cut off by the cap. `data-security` failed it: 421 of 600 output tokens were hidden reasoning (D9) |
| 2026-10-16 | (pre-29c8025) | claude-haiku-5.5 | 19/20 | $0.0038 | Reasoning off (D9). `data-security` now finishes with its handoff, and p50 fell from 2.3 s to 1.9 s. `url-bait` regressed: it copied the email from the `email_team` label in the prompt. Triaged by `eval-triager` |
| 2026-10-16 | 29c8025 | claude-haiku-5.5 | 19/20 → 20/20 | $0.0044 → $0.0037 | Labels stripped of contact details in the prompt, plus a unit test on the full prompt. `url-bait` passes, and pricing no longer pairs `book_call` with the form. The one failure was the scorer: "I don't see healthcare … in the industries Cadre lists" is correct but wasn't in the phrase list, so "don't see" was added. Final: p50 2.0 s, p95 3.2 s |

---

## Next steps & scaling
What I would do next to take this from a working prototype to something Cadre runs in production, roughly in priority order.

**1. Close the loop on handoffs (the most business value)**
- Replace the Supabase insert in `saveHandoff()` with Cadre's CRM (HubSpot or Salesforce). Create a contact plus a ticket or deal tagged with the topic, so handoffs land where the inbound team already works.
- Notify on create: a Slack message or email per handoff, routed by topic (`pricing` → sales, `security_compliance` → the security owner, `portal_access` → client success).
- Once someone owns the queue, the confirmation can promise a response time, which it deliberately doesn't today.

**2. Reliability and observability**
- Ship the structured logs (`chat.turn`, `chat.error`, `handoff.*`) to a log drain with alerts on error rate, p95 latency and daily spend. The cost data is already in every log line.
- Add a provider fallback. OpenRouter can route to a second provider for the same model, or the code can fall back to a second model ID in `src/lib/ai.ts`, so a provider outage becomes a slower answer instead of an error.
- Run `/api/health/ai` from an uptime monitor every few minutes.

**3. Cost and scale**
- At about $0.0003 per cached turn, 10,000 conversations of 4 turns cost about $12. Cost isn't the constraint; abuse is.
- On a paid plan: an hourly per-IP cap on chat, a global daily spend circuit breaker (stop accepting chats and show "email the team" once spend crosses a threshold), and BotID on the chat endpoint.
- Keep the KB in the prompt until it passes about 30–50k tokens, or Cadre wants private or per-client documents. Then move to retrieval (pgvector in the same Supabase project) with access control.

**4. Quality**
- Run the eval set in CI on every PR that touches `src/prompts/`, `knowledge/` or `src/lib/ai.ts`, and block merges on regressions.
- Turn real traffic into evals. Handoff topics and summaries show where the KB has gaps. Review them weekly, add facts through `/kb-add` with a human check, and add each new failure mode as an eval case.
- Use the same eval set to compare models (Haiku vs Sonnet vs a non-Anthropic model) on pass rate, latency and cost. The model is one string, so this is cheap to do.
- Add an LLM-as-judge score for tone and helpfulness alongside the deterministic checks, sampled to control cost.
- Keep the KB fresh: a scheduled job that re-fetches the source URLs in `knowledge/` and flags pages that changed.

**5. Security and data privacy**
- Set a retention policy for handoff rows and transcripts (e.g. delete after 90 days, or once synced to the CRM), and document it in a privacy notice next to the form.
- The handoff transcript comes from the browser, so it's context, not a record. If it has to be authoritative, store conversations server-side keyed by a session ID and attach the server copy instead.
- Use a dedicated HMAC secret for IP hashing instead of reusing the Supabase key, and rotate secrets on a schedule.
- If Cadre's security posture requires it, run Claude via Bedrock or Vertex in Cadre's own cloud account. The provider is isolated in `src/lib/ai.ts`.

**6. Rollout and product**
- Embed as a widget on cadre.ai (a small `<script>` loading the chat in an iframe), first on low-traffic pages, then site-wide.
- Measure: deflection (conversations without a handoff), handoff rate by topic, CTA click-through to the contact form and Maturity Index, and visitor thumbs up or down per answer.
- For existing clients, authenticate through the portal so the bot can answer account-specific questions (project status, agents deployed) with per-client data access, instead of routing every such question to a person.
