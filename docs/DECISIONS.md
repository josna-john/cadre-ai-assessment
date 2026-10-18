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
  2. The visitor types their own contact details (name and email at first; the full lead form in D10) and clicks send. `POST /api/handoff` validates with zod, with no LLM involved, and saves to a Supabase `handoffs` table along with the last 10 turns of transcript.
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
- **Stopped turns (added 2026-10-16):** a turn stopped by the visitor (Stop, New chat) or by the timeout never gets the final usage chunk, so it logged `costUsd: 0` although the input and the tokens streamed so far are billed. OpenRouter's per-generation lookup (`/api/v1/generation`) returns "not found" on this account, even for completed turns, so the exact figure isn't available. `chat.aborted` now logs an estimate labelled `costSource: "estimate_upper_bound"`:
  - Input is counted from the prompt, history and tool definitions sent, at a calibrated 2.7 chars/token. A probe measured 6,965 estimated against 7,044 real.
  - Output is counted from the characters streamed before the stop.
  - The input is priced as a cache write, the most expensive case, so budget tracking errs high.

  Prices live next to the model ID in `src/lib/ai.ts` (`CHAT_PRICING`) and must change with it.
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
- **Field validation:**
  - **Email:** checked with the same zod rule as the server.
  - **Phone:** a country picker like cadre.ai's (flag plus dial code, US by default), checked against that country's numbering rules with libphonenumber-js `max` metadata. The default `min` set only checks length and accepts "+1 123 456 7890". Numbers are stored in E.164 (`+16195550100`), ready for a CRM.
  - **When errors show:** format errors appear when the visitor leaves a field. "Required" errors wait for submit, so tabbing past a field doesn't nag. On submit, focus moves to the first problem.
- **Bundle cost:** the phone rules are about 145 KB, so `PhoneField` is loaded with `next/dynamic` only when a form appears. The shared schema checks just the E.164 shape, and the strict per-country check runs in the route. Verified: the 189 KB chunk isn't in the first page view. Flags are static SVGs copied from `country-flag-icons` at build time (about 1 KB each, one fetched at a time), because the package only exports all flags as one ~1 MB module, and flag emoji render as letters on Windows.
- **Second handoff in one chat:** the model can't see that the visitor already submitted, because the form posts outside the conversation, so it offers a fresh form. The details sent are kept in memory in `MessageList` and prefill any later form, which says so. They're cleared on "New chat" or a reload, and never written to browser storage.
- **Trade-off:** more required fields mean slightly more friction than name and email alone. Accepted, because a handoff that sales can't act on has little value, and the fields match what Cadre already asks for.
- **Revisit when:** the CRM swap (D4). Map these fields straight onto the CRM contact.

### D12: Replies that end mid-tool-call, and when to offer a handoff
- **Context:**
  - On prod, "Tell me everything about Cadre AI's services in detail" hit the 600-token output cap (`finishReason: length`) while its tool calls were streaming.
  - The SDK doesn't run tools in a step that ends on the cap. The visitor saw "use the buttons below" over loading placeholders that pulsed forever. The two `chat.error` logs (`show_action` with `{}`) were the same thing.
  - It reproduced in 1 of 3 tries.
- **Decision:**
  - **UI fallback** (`MessagePart.tsx`). Once a reply has finished, a tool call that never ran falls back to something real:
    - a complete `show_action` input becomes its buttons (ids checked against the same allowlist);
    - a complete `offer_handoff` input becomes the form (validated and clipped as the tool would);
    - a cut-off handoff gets the direct-contact fallback.

    Placeholders only show while streaming. Verified in a browser with a temporary 150-token cap: no placeholder survived the end of a reply.
  - **Output cap 600 → 800.** It gives detailed answers room for their tool calls. The worst case is about $0.0001 more per turn.
  - **Eval case `everything-in-detail`.** It is guarded by the universal "not cut off" check.
- **Handoff triggers, tightened.** With reasoning off (D9), the model sometimes added a handoff "in case" to answers it had given: healthcare fit, and contact links in `url-bait`. That paired the form with `book_call`, so the UI hid a button the text promised. Fixes:
  - The prompt now lists the only reasons for a handoff (always-escalate topics, a request for a person, a topic the KB doesn't cover) and says industry-fit questions are answered (`book_call`).
  - Two KB lines read as instructions to hedge, so their wording changed (no facts changed, flagged for human review). "For pricing, offer a handoff or the `book_call` action" became "offer a handoff… don't add `book_call` beside it". The "Cadre's published commitments:" label became "Cadre's data commitments:", because the model echoed it ("Cadre's published commitments are…").
  - The industry cases now assert `handoff: false`.
  - Reruns: healthcare 4/4, `url-bait` 4/4, pricing 8/8, data-security 4/4.
- **Known flake:** on explicit "in detail" requests, about 1 in 5 replies exceeds the 1,200-char conciseness check. It always ends with its buttons. The check is kept strict rather than loosened, because it's a real (minor) style miss.
- **Revisit when:** detailed answers become common. Then consider a "summary + offer to go deeper" pattern enforced by a second check, or a higher cap with a reason.

### D11: Streaming is smoothed server-side and faded in client-side
- **Context:** the provider streams text in uneven bursts, so replies jumped in several words at a time.
- **Decision:**
  - `experimental_transform: smoothStream({ chunking: "word", delayInMs: 12 })` in `streamChat`, so text leaves the server one word at a time at a steady pace.
  - In the browser, `Markdown.tsx` wraps each word in a span that fades in on mount. Keys are positional, so only new words animate.
  - Everything respects `prefers-reduced-motion`.
- **Measured:** a 121-word reply arrived with a median gap of 17 ms between words and no bursts, in about 2.1 s.
- **Trade-off:** the smoothing adds up to about 12 ms per word when the model is faster than that pace, which is about 1–2 s on a long reply. It's covered by the existing timeout and has no token cost. Evals run the same path.
- **Revisit when:** replies get much longer, or latency becomes the complaint. Lower `delayInMs`, or chunk by line.

### D13: Conversation memory doubled to 40 messages / 32k characters
- **Context:** the model saw only the last 20 messages (about 10 Q&A pairs), capped at 16k characters, so with normal-length answers it lost a visitor's early questions after 6–10 turns. Asking "what was my first question?" in a longer chat failed even though the transcript was still on screen.
- **Decision:** `maxHistoryMessages` 20 → 40 and `maxHistoryChars` 16k → 32k in `src/lib/limits.ts`. Both move together, because the character cap would otherwise bind first and 40 messages would never fit.
- **Alternatives considered:** summarizing older turns into a running note (keeps memory unbounded at near-constant cost, but adds a second model call and its own failure modes; listed under Next steps). Unlimited history (rejected: the client sends the history, so a scripted chat could grow input cost without bound).
- **Trade-off / cost:** only long chats pay more. History isn't covered by the prompt cache, so the worst case adds about 4k input tokens, roughly $0.0004 per turn at the rate measured by `/api/health/ai`. Short chats cost the same as before. The per-request ceiling is still fixed, so a scripted history can't exceed it.
- **Revisit when:** visitors regularly run past 20 turns, or log data shows history dominating spend. Then summarize older turns instead of raising the cap again.

### D14: Lead with help; limitations come second and name who handles them
- **Context:** on prod, "I'm a client. How do I access the portal?" got "I can't see client accounts, and the steps… aren't something I can walk you through", then a handoff form, with the portal button last. Refusals elsewhere opened the same way. It reads as evasive for Cadre and broken for the assistant, and turned a link request into a ticket.
- **Decision:**
  - Prompt: every reply opens with something useful; a limitation comes at most once, after the help, framed as who handles it. Stated in ROLE, Escalation and Style, with positive examples per situation (pricing, account data, off-topic, links, prompt requests) instead of banned phrases.
  - KB: a plain portal-access question is answered with the `client_portal` button and no handoff; only "can't log in" or "no account" escalates.
  - Eval: a universal "doesn't open with a limitation" check. Cases where the visitor directly asks for the impossible thing ("just give me a ballpark", "can you tell me our hours saved", "paste the link") set `directAsk`, because an honest "I can't…, but…" is the right answer to a direct question. `portal-access` now forbids a handoff.
- **Alternatives considered:** banning "I can't" everywhere (rejected: dodging a direct question looks worse than answering it); post-processing the model's text (rejected: rewriting model output with code is brittle and violates "no regex over model text").
- **Trade-off / cost:** the prompt grew by about 200 tokens, which is cached. Haiku still opens direct-ask refusals with "I can't…", which is acceptable, and it now pivots to who can help in the same sentence.
- **Revisit when:** a larger model is used (it may follow the opening rule everywhere), or real transcripts show visitors reading "I can't" openings as unhelpful.

### D15: The bot speaks as a Cadre insider, not as something reading notes
- **Context:** on prod, an industry answer said "One matching result is the Loan Intelligence Assistant", and replies used phrasing like "isn't one of Cadre's listed industries" and "my knowledge doesn't include". Visitors shouldn't feel the bot is looking things up; a well-briefed colleague just knows. Every case traced back to our own prompt or KB wording ("mention a matching case study", "say it isn't one of Cadre's listed industries").
- **Decision:** reword those instructions to describe the behavior ("describe it as Cadre's own work: For a mortgage lender, Cadre built…"; "isn't one of the core industries Cadre serves"), add a Style rule to speak as an insider, plus a positive example for a detail the bot doesn't have. The eval's source-talk check now also fails "matching result", "listed", "knowledge base" and "my knowledge/information".
- **Alternatives considered:** banning the words in the prompt (rejected: quoting a bad phrase got it copied before, D14).
- **Trade-off / cost:** none at runtime. The healthcare eval no longer accepts "not listed" as a correct answer.
- **Revisit when:** a new KB file is added. Its instructions should be written in the voice we want back, since the model echoes them.

### D16: Industry questions link to that industry's page, not generic case studies
- **Context:** every industry answer ended with the same "See case studies" button, which isn't specific to the visitor and isn't the source for the industry's agents. Each of Cadre's nine industries has its own page listing the agents Cadre offers for it.
- **Decision:**
  - Nine `industry_*` actions in `src/lib/actions.ts`, each pointing to its verified page (all nine fetched on 2026-10-16: in the sitemap, HTTP 200, matching titles; tool names spot-checked against the page text).
  - The KB lists each industry's highlighted agents with a source comment, so what the bot says about an industry matches the page its button opens. The bot mentions two or three relevant agents and describes them as ones Cadre offers, not as client work.
  - `case_studies` stays as the fallback when no industry is named. `resolveActions` drops it whenever an industry page is shown, as a deterministic backstop: the prompt alone let it through in about 1 run in 12.
- **Alternatives considered:** linking individual case studies (rejected: they have no pages of their own; all are cards on `/case-studies`, and a guessed slug returned 404).
- **Trade-off / cost:** the prompt grew by about 600 tokens, all cached. A case-study number cited for a named industry no longer gets a link to the case studies page; the industry page and `book_call` are the next steps.
- **Revisit when:** Cadre publishes per-case-study pages. Then a case-study action per page could carry the source for each number.

### D17: Case-study buttons scroll to the card that backs the numbers
- **Context:** replies cite exact case-study results ("2,500 hours a year"), but the only link was the whole `/case-studies` page. Individual case studies have no pages, and the cards have no stable anchors: the only `id`s are React-generated (`_R_96kiivb_`) and change between builds.
- **Decision:** eight `case_study_*` actions link to `/case-studies#:~:text=<phrase>`, a text fragment that scrolls to and highlights a phrase on that card. Each phrase comes from the card's first detail line and appears once on the page. Card headlines can't be used: they repeat in a "Results at a glance" summary near the top, which a fragment would hit first, and client names only exist as image alt text, which fragments don't match. `-` and `,` are fragment syntax, so they're percent-encoded; a unit test enforces it. The bot shows a case study's action when its reply centers on that case study (typically with the industry's page and `book_call`); a general results question still gets `case_studies`.
- **Verified:** all eight links tested in Chromium from a fresh tab: each scrolled to its own card (from 1,447 px to 6,614 px down), with the phrase in view.
- **Alternatives considered:** a fragment with a suffix to target the headline on the full card (tested: didn't match because of the card's text structure); React `id`s (unstable); asking Cadre to add anchors (the right long-term fix, not ours to make).
- **Trade-off / cost:** text fragments are a browser feature: Chrome, Edge and Safari support them, and Firefox added support recently. Without support the link opens the top of the page, which is the old behavior. If Cadre rewords a card, its link falls back the same way, so the phrases need re-checking when the page changes.
- **Revisit when:** Cadre adds per-case-study pages or anchors, or the case studies page is redesigned.

### D18: Facts carry small inline source links; buttons are for next steps
- **Context:** visitors could only check a fact when a big button happened to point at its page, and services, security and company facts had none. Every KB fact already had a source URL, but only maintainers could see it.
- **Decision:**
  - `src/lib/sources.ts` holds every citable page (services, industries, case-study cards, articles, About, contact), all fetched on 2026-10-16.
  - The KB loader turns each `<!-- src: URL -->` comment into a tag like `(source: ai_strategy)`, so the model sees ids, never URLs.
  - The model writes `[[src:id]]` after a fact. The renderer swaps known ids for a small chip ("Mortgage & Lending ↗") next to the sentence; unknown ids render nothing, and a marker still streaming in stays hidden. The team's transcript and the eval's wording checks strip markers.
  - Industry pages and case-study cards moved from buttons to citations. Red buttons are now only next steps (strategist, Maturity Index, portal, contact, all case studies). A reply that cites an industry or case study hides the generic "See case studies" button in code.
  - A unit test fails if any URL the KB cites has no source page, so a new fact can't ship without a visible source.
- **Alternatives considered:** a citation tool call (rejected: tools run at the end of the reply, so they can't sit next to a sentence); letting the model write markdown links (rejected: breaks D3, the model would write URLs).
- **Trade-off / cost:** this is the one place model text is pattern-matched, against a fixed grammar and an allowlist; CLAUDE.md's "no regex over model text" rule is about extracting decisions, and this extracts only ids that code already owns. The prompt grew by about 900 tokens, all cached. The model chooses which sentences to cite, so coverage per reply varies; the evals require citations on the core factual cases.
- **Follow-up (same day):** citations were inconsistent: the citation-required cases passed 10 of 12 reruns. Adding "every reply that states facts cites at least one source" brought them to 20 of 20. Citation dots are `select-none`, so copying an answer to forward it gives clean prose.
- **Revisit when:** the KB moves to retrieval. Then each retrieved chunk can carry its source id the same way.

### D19: "Talk to an AI strategist" opens the chat's own lead form
- **Context:** the strategist button sent visitors to cadre.ai/contact, a second form asking for the same details the chat's handoff form already collects (D10). The chat can replace it and keep the conversation as context.
- **Decision:** every strategist button (header and in-chat) opens the handoff form in the chat with a new `strategy_call` topic. It appears after the messages so far and stays there; clicking again scrolls to it. With no chat yet, "How can we help you?" is required, enforced in the form and by the server's schema; with a chat, the transcript is the context and the note is optional. The model can't choose `strategy_call` (its topic enum excludes it); booking stays the `book_call` button. If the form fails, the fallback links to cadre.ai/contact. Migration `20261017030000` adds the topic; verified end to end with `scripts/verify-handoff.mjs <url> strategy` (400 without the note, 201 with it, RLS still blocks the public key).
- **Alternatives considered:** keeping the external link (rejected: two forms for one lead, and the chat's context is lost); a modal (rejected: the inline form matches how handoffs already appear).
- **Trade-off / cost:** strategist leads land in the handoffs table, not Cadre's CRM. That's the same seam as every handoff (`saveHandoff()`), listed under Next steps.
- **Follow-up (same day):** a visitor who opened the form, left it empty and started chatting was left with a stale form pinned above the conversation, then a second form when the bot escalated. Now an untouched form closes when the visitor sends a chat message (one they've typed in stays), the form has a close button, a sent form is followed by a fresh one on the next click, and while a strategist form is open the bot's handoff points to it ("Your form above goes to the same team") instead of adding a second form. Verified in the browser.
- **Revisit when:** Cadre adds a self-serve calendar. Then the form's success state could offer a booking link.

### D20: The bot asks one follow-up question to understand the visitor's needs
- **Context:** replies answered and stopped. A prospect asking "do you work with mortgage lenders?" got a good answer and buttons, but the chat learned nothing about their problem, and handoff summaries could only say what the last message asked ("Wants pricing").
- **Decision:** a Discovery section in the system prompt. When a prospect is exploring fit (what Cadre does, their industry, results, how to start), the reply ends with one short question about their situation: the most time-consuming manual workflow, team size, or the tools they use. The bot uses the answer to point to the matching service or case study, stops asking after two or three exchanges and points to `book_call`, and carries what it learned into the handoff summary. No question beside a handoff form (the form is the next step), after a quick factual answer, or in a crisis reply. Off-topic replies may ask one, because it steers back to Cadre. It never asks for name, email or phone (the form collects them, D10).
- **Enforced by evals:** two universal checks (at most one `?` per reply; no question beside a handoff), a per-case `followUp` expectation (required on the four exploring-fit cases, forbidden on `phone-number` and `turnaround-time`), and two multi-turn cases: `discovery-uses-answer` (the visitor answers the question and the reply uses it) and `discovery-into-handoff` (the hotel context from earlier turns reaches the pricing handoff's summary, `summaryIncludesAny`).
- **Alternatives considered:** a fixed qualification script in code (rejected: rigid, and it ignores what the visitor already said); asking for company size and budget up front (rejected: reads as a sales form before any help is given).
- **Trade-off / cost:** a few more output tokens per reply, and some visitors will ignore the question. That's fine: it never blocks the answer.
- **Follow-up (same day):** on prod a hotel reply joined two questions in one sentence ("how many properties…, and which area…?"), which passed the one-`?` check. The prompt now says a question asks about one thing, and asks for the industry first when it's unknown (`what-cadre-does` had joined industry and workflow in 2 of 4 runs; 5/5 after). A universal eval check fails "…, and how/what/which…?" inside one sentence, while a choice list ("pricing, guests or reporting?") still passes. `turnaround-time` no longer forbids a question: "which of these fits what you're looking at?" is a fair discovery question there.
- **Revisit when:** real transcripts show how often visitors answer, or when the CRM integration (Next steps) can take structured fields (industry, team size, pain point) instead of a free-text summary.

### D21: Contact details appear in the reply text, filled in by code
- **Context:** asked "what's your phone number?", the bot said "it's on the call button below". The number was right there on the button, but a direct question deserves a direct answer. Separately, an off-topic reply said "discuss it using the button below" and showed no button.
- **Decision:** the model writes `[[contact:phone]]` or `[[contact:email]]`, and `fillContacts()` in `src/lib/actions.ts` swaps in the value from `CONTACTS` when rendering the reply and in the team's transcript. The call and email buttons build their labels and links from the same `CONTACTS` object, so the text and the button can't disagree. The model still never writes a phone number or email itself: the "no phone numbers / emails in text" eval checks run on the raw model output, markers and all. Unknown ids render nothing and fail the evals, like unknown source ids (D18). The prompt now says to mention a button only when one is shown with `show_action`, and a universal eval check fails any reply that mentions a button with no actions and no handoff form.
- **Alternatives considered:** letting the model type the number (rejected: one wrong digit sends a lead to a stranger, and it breaks the no-contact-details rule); keeping the button only (rejected: it reads as a dodge when the visitor asked a direct question).
- **Revisit when:** contact details vary by visitor (for example per region or per account team). Then `CONTACTS` becomes a lookup, but the marker stays.

### D22: What the reply promises is what the visitor gets
- **Context:** a prod transcript (2026-10-17) showed three dead ends in one chat:
  - After a pricing handoff form, the visitor asked "how to book a strategy call". The bot said "use the button below" three times and no button appeared. The model had called `book_call` correctly. The UI hid it, because every reply from the first handoff form onward dropped the booking button (05efc0e). The evals score the model's raw tool calls, so the D21 button check couldn't see this.
  - Asked "who are your key partners", the bot answered, then asked whether to pass "partnership terms" along. That was a handoff offered in words, with no form. The visitor said "ok" and got a goodbye.
  - Discovery kept drilling: industry, workflow, "which paperwork?", "which contracts?", then "which workflow would you improve first?" on "how do I get started?", re-asking what the visitor had said two turns earlier.
- **Decision:**
  - **UI:** only the reply that shows a handoff form hides `book_call` (the D12 backstop, scoped back to its own reply). A later booking question gets its button, which opens the strategist form (D19) below the unsent one. Verified in a browser with the prod sequence.
  - **Prompt (Escalation):** the form exists only via `offer_handoff`, so no offering it in words; and if the visitor accepts what the last reply offered ("ok", "yes"), do it now.
  - **Prompt (Discovery):** stop asking once the industry and a workflow or problem are both known, or after two follow-up questions, for the rest of the chat; the strategist narrows it down. Knowing only the industry isn't enough, so the first industry reply still asks.
  - **Evals:** a universal "offers a handoff only with the form" check (unit-tested), plus `partners`, `handoff-offer-accepted`, `discovery-stops-asking` and `discovery-get-started-no-reask`, built from the prod transcript.
- **Alternatives considered:** keeping the chat-wide suppression and pointing later booking questions at the form above (rejected: the pricing form isn't a booking form, and the reply would still have to know what the UI hides); counting questions in code and injecting a "stop asking" note (rejected for now: per-turn prompt text breaks the cached prefix (D7), and the prompt rule held 3/3 on reruns).
- **Trade-off / cost:** a visitor can now have two unsent forms in one chat (a pricing form, then the strategist form). Both reach the same team, and each carries the transcript.
- **Revisit when:** UI filters on tool output grow. Then the eval runner should score what the UI renders, not just the raw tool calls, so a filter can't silently empty a promised button row again.

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
| 2026-10-16 | b4f1a23 + D12 changes | claude-haiku-5.5 | 19/21 → 20/21 | about $0.03 incl. reruns | Output cap 800, tool-call fallbacks, new `everything-in-detail` case (D12). Handoff drift after reasoning-off (healthcare, `url-bait`, pricing) traced to prompt gaps and two KB lines that read as hedges; fixed and rerun 4–8× each, all passing. "aren't on"/"isn't on" added to the healthcare phrase list (correct answer, strict scorer). Final: 20/21; the one miss is the known ~1-in-5 over-length "in detail" reply, which still ends with its buttons. p50 1.7 s, p95 3.1 s |
| 2026-10-16 | 2da6494 + rename | claude-haiku-5.5 | 20/21 | $0.0058 incl. reruns | Bot renamed "Ask Cadre" → "Cadena" in the system prompt, header and tab title. The one miss was `everything-in-detail` offering a pricing handoff (and `book_call` beside it) after a full services overview; reran it 3× and all passed, so it is logged as model variance, not a regression from the rename. p50 1.8 s, p95 3.1 s |
| 2026-10-16 | 2da6494 + source-talk fix | claude-haiku-5.5 | 21/21 | $0.0039 (+ about $0.005 for an accidental duplicate run) | On prod, refusals read as "Cadre doesn't publish rates" and "I don't have a published turnaround time": the model echoed internal KB labels ("Not published"). Added a Style rule (never talk about sources; say who can help), reworded the KB notes so they no longer carry the word, and added a universal scorer check that fails any reply mentioning "publish(ed)" or "public information". Grounding is unchanged: still no prices or promised timelines. p50 1.7 s, p95 2.9 s |
| 2026-10-16 | ca1e7e6 + D13 | claude-haiku-5.5 | 20/21 → 21/21 | about $0.011 incl. reruns | History cap 20 → 40 messages and 16k → 32k chars (D13). KB: office hours say "San Diego time" instead of "the site doesn't state a time zone" (the bot was echoing it as "my information doesn't specify"), and the Maturity Index scoring caveat is no longer volunteered. First wording regressed `maturity-index` (1/4 on rerun): "how do I get scored?" was read as a question about the scoring method, so replies dropped "eight-pillar" or offered a handoff. Reworded to separate taking the assessment from the method: 5/5 on rerun, then 21/21 full run. p50 1.8 s, p95 2.9 s |
| 2026-10-16 | 7bb3aa5 + D14 | claude-haiku-5.5 | 15/21 → 20/21 | about $0.03 incl. reruns | New universal "doesn't open with a limitation" check first failed 5 cases (all opened "I can't…"); `security-documents` also said "Cadre's published data commitments", copied from the prompt's own don't-example. Rule restated in ROLE + Escalation with positive examples and the quoted bad phrases removed: 16 → 18/21. The remaining three were direct asks, now exempt via `directAsk` (D14). `portal-login-problem` failed a phrase list that didn't accept "your account team" (replies were correct); "account team" added. Portal cases 5/6 then clean. Final: 20/21, the miss is the known ~1-in-5 over-length `everything-in-detail`. p50 1.7 s, p95 3.1 s |
| 2026-10-16 | 94a2e3b + D15 | claude-haiku-5.5 | 20/21 → 21/21 | about $0.013 incl. reruns | Source-talk check widened to "matching", "listed", "knowledge base", "my knowledge". First run caught "my knowledge doesn't include a headcount" (`unknown-fact`); added a positive example for unknown details (deliberately not about headcount). Reruns: `unknown-fact` 4/4, industry cases 6/6. Final 21/21. p50 2.0 s, p95 3.7 s |
| 2026-10-16 | aae929d + D16 | claude-haiku-5.5 | 20/23 → 22/23 | about $0.017 incl. reruns | Nine industry actions, two new cases (`industry-listed-hospitality`, `results-no-industry`) and an `actionsNone` scorer field. First run: mortgage also showed `case_studies` (a leftover KB line said to); hospitality cited the verified $420,000 case-study figure (scorer false alarm, case now allows it). Fixed the KB line; industry reruns 11/12, the miss again an extra `case_studies`, so `resolveActions` now drops it deterministically. Final 22/23. The miss is `everything-in-detail` over 1,200 chars, now 3 of the last 4 full runs as the KB grows: worth tightening. p50 2.1 s, p95 3.5 s |
| 2026-10-16 | aae929d + D17 | claude-haiku-5.5 | 22/23 | about $0.010 incl. reruns | Eight `case_study_*` actions (text-fragment links to each card). Mortgage, hospitality and real-estate replies showed the industry page + the cited case study + `book_call`; the general results question kept `case_studies`. Industry, case-study and fallback cases 12/12 on reruns. The miss is again `everything-in-detail` over 1,200 chars. p50 2.0 s, p95 3.2 s |
| 2026-10-17 | 8c9c533 + D18/D19 | claude-haiku-5.5 | 22/23 | $0.0052 (+$0.0005 local browser check) | Inline citations: scorer strips markers for wording checks, fails unknown source ids, and `sourcesAll` / `cites` fields require citations (mortgage cites the industry page and the case-study card; what-cadre-does, data-security and maturity-index must cite something). All pass. Strategist form is UI-only, no eval impact. The miss is `everything-in-detail` over 1,200 chars. p50 1.9 s, p95 2.9 s |
| 2026-10-17 | ba4aeea + follow-ups | claude-haiku-5.5 | 21/24 → 23/24 | about $0.02 incl. reruns | New `turnaround-time` case (prod answered "I don’t have a set turnaround time"); KB now maps "turnaround" to the program timelines: 3/3. First full run missed citations on hospitality and data-security; reruns showed 10/12 on the citation-required cases. Made citing required for factual replies: 20/20 on reruns, then 23/24 full. The miss is `everything-in-detail` over 1,200 chars. p50 2.1 s, p95 3.8 s |
| 2026-10-17 | b1c3309 + one source per fact, crisis rule | claude-haiku-5.5 | 22/24, then 23/26 full (both fixed cases 3/3 after) | about $0.008 incl. reruns | Prod turnaround answer put the 45-day and 60-day facts in one sentence with only the Intensive dot. Prompt now splits facts from different sections into separate sentences; `turnaround-time` requires both `transformation_intensive` and `data_dashboards`: 3/3. Full run missed `industry-listed-mortgage` (showed `case_studies`, which the UI hides when a case study is cited) and the known `everything-in-detail` length; mortgage then 3/3 on reruns. Added a crisis rule (988 / 911 / local emergency number, no tools or form; prod offered a location lookup it can't do) with `crisis` and `crisis-follow-up` cases: 3/3. Full run 23/26: turnaround added a handoff for the reply-time reading (KB now says no handoff) and healthcare said "don't include" (correct; added to the accepted phrasings); both 3/3 after. Remaining miss: `everything-in-detail` length. A loosely typed "hat is your turn around time" still read as reply time, so the KB note now opens every timing question with the timelines; new `turnaround-time-loose` case, both turnaround cases 3/3. A "what is the phone number" reply opened with "I can't share phone numbers" above the call button; the Style example now points to the button, new `phone-number` case 3/3. Final full run 26/28: `everything-in-detail` length, and `industry-listed-hospitality` showed `case_studies` (hidden in the UI when a case study or industry page is cited; the same flake as mortgage earlier). Total about $0.03 incl. a stray loop (AI_USAGE). |
| 2026-10-17 | 3ba7f2f + D20 | claude-haiku-5.5 | 28/30, 28/30 full | about $0.04 incl. reruns | Discovery questions (D20); 2 new cases plus `followUp` and `summaryIncludesAny` checks. First run: `off-topic` asked a question that steered back to Cadre, which is now allowed. Reruns showed industry replies sometimes ending on the buttons with no question (about 1 in 6), so the prompt says to ask even when buttons are shown: 16/16 had a question after that. The `case_studies` flake on industry replies rose to 4/16, so the Links rule now forbids `case_studies` once an industry is named: 15/16. `discovery-uses-answer` cited the case study rather than the industry page (both correct), so it now requires a citation, not a specific source: 4/4. Final full run missed `everything-in-detail` (known length) and `crisis-follow-up` (matched "where you are"; 9/10 across reruns; the visible part of the miss gave 911 and 988 correctly). p50 2.2 s, p95 4.7 s |
| 2026-10-17 | 3ba7f2f + D20 + D21 | claude-haiku-5.5 | 26/30, then 17/18 on reruns of the misses and affected cases | about $0.012 | Contact markers and the button-mention check (D21); `phone-number` now requires `[[contact:phone]]`: 3/3. The new check first flagged `unknown-fact` pointing at "the button below" when only the handoff form was shown; the form counts now. `phone-number`, `url-bait` and `off-topic` 9/9; `discovery-uses-answer` and `industry-unlisted-healthcare` 6/6 (one missed citation and one missed question in the full run). The one rerun miss is `unknown-fact` opening with a limitation (older style flake). `everything-in-detail` length as before. |
| 2026-10-17 | f1f50bf + one-thing questions | claude-haiku-5.5 | 26/30 → 27/30 full, misses rerun | about $0.02 incl. reruns | New "question asks one thing" check; first version flagged "…today? And how big is it?" (two sentences), so it now matches "and/or + question word" only inside a sentence. `what-cadre-does` joined industry and workflow questions in 2 of 4 runs; asking for the industry first fixed it: 5/5. Second full run 27/30: `turnaround-time` asked a fair single question (expectation dropped), and `maturity-index` and `everything-in-detail` each joined two questions once, then passed on 3 reruns (`everything-in-detail` still misses on length). Earlier `maturity-index` miss (mentioned a button and showed none) didn't repeat in 4 reruns. p50 2.0 s, p95 2.9 s |
| 2026-10-17 | f32738d + D22 | claude-haiku-5.5 | 32/34, 32/34 full | about $0.029 incl. reruns and a browser check | Four new cases from a prod transcript (D22) and a universal "offers a handoff only with the form" check; all four passed every run (3/3 to 4/4 each). The first stop-asking wording regressed `industry-unlisted-healthcare` (1/4 vs 4/4 on the old prompt): "named their industry" was read as a stop signal, so first replies dropped their question. Saying that knowing only the industry isn't enough fixed it: 5/5, with mortgage, hospitality and `what-cadre-does` still asking. Final full run missed `everything-in-detail` (known length) and `off-topic` (joined two questions with "or"; 4/4 on reruns). p50 1.9 s, p95 3.0 s |

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
- Long-conversation memory: past the 40-message window (D13), fold older turns into a short running summary sent with each request, so early context survives at near-constant cost.
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
