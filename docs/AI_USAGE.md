# How AI Tools Were Used

A running log of how AI tools were used to build this project, with concrete examples of what worked and what had to be corrected.

## Tools
- **Claude Code** (Opus 5.5): planning, scaffolding, implementation, tests, docs, and infra through the Vercel, Supabase and GitHub CLIs
- **Claude Code subagents**: parallel KB research and UI build, and pre-commit code review (see Workflow)
- **Playwright** (driven by Claude Code): checking the UI in a real browser against the live model
- **Claude Haiku 5.5**: the chatbot itself (not used for development)

## Workflow
- `CLAUDE.md` is onboarding for a fast but context-limited developer:
  - the product's hard rules (no invented facts, no model-written URLs)
  - where code goes
  - budget limits
  - Next 16 and AI SDK 7 gotchas
- Project slash commands (`.claude/commands/`):
  - `/preflight`
  - `/eval`
  - `/kb-add`
  - `/ship`
  - `/budget`
- Subagents (`.claude/agents/`):
  - `kb-researcher` (read-only web research with sources)
  - `eval-triager` (classifies eval failures)
  - `diff-reviewer` (reviews generated code against CLAUDE.md before commit)
- A PreToolUse hook (`.claude/hooks/block-secrets.mjs`) blocks `git commit` when the staged diff contains a key. It was tested with a fake key before being relied on.
- Plan first (`plan.md`), then build in small reviewed increments, with a deploy after each one.

## Log
| When | Task | What AI did | What I changed / verified myself |
|---|---|---|---|
| Oct 14 | Project setup | Drafted CLAUDE.md, the doc skeletons, and the git repo | Supplied the context, reviewed the structure |
| Oct 14 | AI pipeline smoke test | Built `/api/health/ai` (structured output + usage) and deployed it before any feature work. It surfaced two blockers on day 0: the gateway needed a card on file, then the free tier excluded current Claude models | Added billing and $10 paid credit. Kept current models rather than downgrading to save $10 |
| Oct 14 | GitHub + Vercel setup | Scaffolded Next.js 16, created the public repo, linked Vercel, deployed. Caught Vercel re-adding `.env*` to .gitignore, which would have hidden .env.example | Logged into Vercel and GitHub, installed the Vercel GitHub app |
| Oct 15 | Brief → plan | Read the brief and turned it into `plan.md` (requirements table, product boundaries, phases). Asked me to decide deadline, knowledge source, escalation design and model | Made the four calls, then had the plan walked through a second time before approving |
| Oct 15 | KB research | Ran a background subagent over cadre.ai (sitemap, service pages, portal, case studies) while planning continued. It found there is no booking calendar (all CTAs go to the contact form) and no public pricing, which changed the action design | Will review every fact against its source page before it enters `knowledge/` |
| Oct 15 | OpenRouter switch | Checked the installed AI SDK docs and npm peer deps before choosing `@openrouter/ai-sdk-provider`. Verified the key and model IDs via OpenRouter's free endpoints, then ran a real health check | |
| Oct 15 | Chat UI (parallel) | A background subagent built `src/components/chat/*` against a written contract (`src/lib/actions.ts`, `src/lib/limits.ts`, the error JSON shape) while the main session wrote the route, KB and prompt. It reported where AI SDK 7 differed from the contract (the error shape) and fixed a Next 16 prerender failure (a random chat ID under Cache Components) | Reviewed its report, then verified the UI end to end in a real browser (Playwright) against the live model |
| Oct 15 | Chat route + KB | Checked the installed AI SDK 7 type definitions before writing the route, and found `onFinish` is deprecated in favour of `onEnd`. Wrote the KB from the research subagent's notes, leaving out everything marked UNVERIFIED | |
| Oct 15 | Handoff (Phase 3) | Loaded the Vercel Marketplace and Supabase agent skills before writing code. Provisioned Supabase from the CLI (terms needed one browser click), wrote the migration with RLS on and grants revoked, then built the two-step handoff (model offers, visitor submits). Verified it against the real DB: a row is saved, the publishable key is denied, and the test rows are deleted | Questioned why a table was needed when Cadre already has a contact form. That led to D4 being rewritten around context, routing and the CRM swap point. Accepted the Supabase terms |
| Oct 15 | Guardrails (Phase 4) | Probed real usage and found prompt caching off, then turned it on (D7). Found and fixed the blank-reply timeout. Added the firewall rule and the handoff cap, and checked both on prod by sending requests until they blocked | Ran the KB fact-check against the source pages, and tested the bot by hand with a list of tricky questions |
| Oct 16 | Docs + submission (Phase 6) | Wrote the README, next steps and this section. Scanned the full git history for secrets, and built the submission zip from a fresh clone | Reviewed the docs and ran the final prod checks in an incognito window |
| Oct 16 | UI redesign + lead form | Pulled design tokens (Inter, Inter Tight and Poppins; sand, dark sand and Cadre red; radii, shadows, easing) and the logo from cadre.ai's live CSS rather than from memory, and audited the computed font of every element. Built word-by-word streaming (D11), a typewriter placeholder, and a "New chat" reset tested mid-stream. Measured alignment and tap targets in a real browser instead of eyeballing them. Turned the handoff into a full lead form after reading cadre.ai/contact's required fields (D10) | Directed every visual call through many rounds of feedback (name, colours, speeds, wording, spacing). Spotted the hedged "published commitments" tone and proposed the lead-form idea |

## Where AI fell short / what I had to correct
- **Oct 15:** the Vercel MCP connector was authenticated to a different account and returned 403 on the project's team. We switched to the Vercel CLI, which was logged in to the right account. Lesson: check which identity a tool runs as before writing to infra.
- **Oct 15:** the `diff-reviewer` subagent found five real bugs that passed typecheck, lint and 16 unit tests. All five were fixed, with regression tests where it made sense:
  - Only the last message was size-capped, so a scripted 20-message history could drain the budget.
  - Pressing Stop mid-tool-call left an orphaned tool call that broke every later turn.
  - Unknown message parts caused an unlogged 500.
  - Stopped or timed-out turns logged no cost.
  - The friendly mid-stream error text never reached the UI.
- **Oct 15:** after the history-trimming fix, an older unit test failed. Analysis showed the code was right and the fixture was wrong: in alternating turns, a 20-message window ending on a user turn always starts on an assistant turn, which is dropped. The test was rewritten to state that, rather than loosening the code.
- **Oct 15:** the first chat route used two model steps. A live curl test showed every answer printed twice, at double the cost. Unit tests and typecheck couldn't catch this, only running the real model did. It's fixed (D5), and the eval set will include a "no duplicated text" check.
- **Oct 15:** the first draft of the system prompt used `${/* comment */ ""}` to put rationale comments inline. It worked but was hard to read, so it was rewritten as named sections, each with a normal comment.
- **Oct 15:** a large multi-file shell heredoc failed on a quoting error and created nothing. We wrote the files individually with the editor tool instead, and checked the result with a listing.

- **Oct 15:** in the handoff route test, `vi.fn().mockRejectedValue()` made Vitest 5 fail the test even though the route caught the error and returned the right 503. Logging the response proved the route was correct, so the mock was replaced with a plain stub instead of changing the route.
- **Oct 15:** the first Phase 3 eval run scored 19/20. The failing case was the scorer's fault: the bot said healthcare "aren't among the industries Cadre lists", which is correct, but the phrase list only had "not among". The reply was read before the list was widened, so the bot wasn't being graded into passing.

- **Oct 15:** the `diff-reviewer` subagent reviewed the handoff before commit and found 12 issues, none blocking. Fixed:
  - If the model's summary went over the length cap, the tool call failed and the reply said "use the form below" with no form. The tool input is now looser and execute() clips the summary; a fallback with email and booking buttons covers any remaining tool error.
  - A 503 unmounted the form and threw away what the visitor had typed.
  - Two fallback messages read badly.
  - No body-size limit on the public endpoint.
  - NUL characters and an emoji split at the transcript cut would become 503s from Postgres.
  - The topic list was hard-coded in three places. The prompt now generates it, and a test checks it against the migration.
  - No `server-only` guard on the database module.
  - `.env.example` was missing a variable.
- **Oct 15:** I edited `handoff.ts` with an inline Python script that crashed on a surrogate escape *after* opening the file for writing. That truncated an untracked file to 0 bytes, which git couldn't restore. It was noticed when every follow-up edit failed to match, then rewritten in full. Lesson: use the editor tool for edits, not scripts that write in place (several files here use CRLF line endings, which also made script string matching fail silently).

- **Oct 15:** Phase 4 found two problems that typecheck and the unit tests couldn't. Both were found by probing real behaviour:
  - Prompt caching was silently off. A one-call usage probe showed `cacheReadTokens: 0`, so 90% of every turn's cost was paying for the same prefix again (fixed in D7, −60% per cached turn). The first fix attempt put the prompt in a `system` *message*, which AI SDK 7 rejects; the type definitions showed that `instructions` accepts provider options.
  - A forced 300 ms timeout showed the server sending an `abort` chunk, which the UI treats like the visitor pressing Stop. The result was a blank reply with no error. It now becomes a retryable error, verified in a browser.
- **Oct 15:** the `diff-reviewer` found 5 non-blocking issues in Phase 4. Fixed:
  - The handoff form's 429 told the visitor to "try again" into a 10-minute lockout.
  - IPv6 clients could rotate addresses within their /64 to reset the handoff limit.
  - A future switch to Gemini or a reasoning model would break on the stripped signatures. Now documented in the code and in D8.
  - Cache tokens weren't logged, so a silent loss of caching would only show up as higher cost.

  It also confirmed the timeout regex can't misfire on a user Stop, and that Vercel overwrites spoofed `x-forwarded-for`.
- **Oct 15:** a second and third firewall rate-limit rule were refused by the Hobby plan. The design was changed to one edge rule plus a database-backed handoff cap (D8), rather than adding a new service.

- **Oct 16:** the system prompt built by AI-written code since Phase 1 listed each button's label, and the `email_team` label contains the address. So the prompt said "never write email addresses" and then showed one. D6's unit test only checked the KB, not the full prompt. It surfaced when reasoning was turned off and `url-bait` copied the email into a reply. The `eval-triager` subagent traced it to the label. Contact details are now stripped before the prompt, and a test covers the whole built prompt (D9).
- **Oct 16:** hidden reasoning silently returned. D7 had recorded `reasoningTokens: 0`, but a day later 421 of 600 output tokens on one question were reasoning, which cut the reply off before its tool call. It passed the "≤ 1,200 chars" check because the visible text was short. A usage probe found it, and a new eval check fails any reply that hits the cap. The first suggested fix (shorter-answer prompt rules) wouldn't have worked on its own, because the visible text was already short.
- **Oct 16:** two first attempts at UI requests were wrong:
  - A "rolling" placeholder was built as a vertical roll when a typewriter was meant.
  - A shortened suggestion was still too long for a phone. Measuring every suggestion against the real text width found three that didn't fit.

  Both were caught by checking in the browser, not by tests.
- **Oct 16:** while verifying a logging fix on prod, the logs showed two `chat.error` entries nobody had seen. Tracing them found replies that hit the output cap mid-tool-call and left placeholders pulsing forever (D12). Turning reasoning off (D9) had also made the model add handoffs "in case". Part of that came from two KB lines whose wording the model copied ("offer a handoff or `book_call`", "Cadre's published commitments"). The `eval-triager` subagent's diagnosis was checked against the prompt before applying it. Each fix was then confirmed by rerunning the flaky case several times, not with one lucky pass. Lesson: read the production logs after every ship, not just the smoke-test status codes.
- **Oct 16:** the Turbopack dev server stopped compiling newly used Tailwind classes after hot reload, so new styles came out invisible (for example, white text with no background), and a `git stash` round-trip left it serving stale CSS. It was caught each time by checking the served CSS for the class, and fixed by a clean restart. Production builds were unaffected: each change was also verified with `next build`.

- **Oct 16:** adding the "no talk of what is or isn't published" scorer through a Python heredoc, `\b` in a non-raw string was written as a literal backspace byte, so the regex never matched. The new unit test caught it (`od -c` showed the `\b` bytes); a `sed` repair then stripped the backslashes entirely, so the line was rewritten with the editor tool. Lesson: edit regexes with the editor tool, not through shell or Python string layers.
- **Oct 16:** a piped eval command ran the full eval set twice and discarded the summary, wasting about $0.005 of the $5 key. Eval output now goes to a file first, then gets read.

- **Oct 16:** a KB rewording meant to stop the bot volunteering "the scoring method isn't something I can cover" ("don't mention scoring unless asked") regressed the `maturity-index` eval to 1/4: the eval asks "how do I get scored?", which the model read as a scoring-method question. The eval caught it before shipping; the fix states what "get scored" means explicitly. Lesson: negative instructions near a common phrasing change how the model reads that phrasing, so rerun the touched case several times, not once.

- **Oct 16:** the prompt quoted bad phrasing as a don't-example (Don't hedge with phrases like "Cadre's published commitments"), and the model copied it into a security reply. The new universal eval check exposed it. Lesson: show the model what good looks like; quoting the phrase you want to avoid puts it in the model's mouth. Same root cause as the "not published" KB labels earlier the same day.
- **Oct 17:** a shell command that applied two edits also carried a leftover loop, `npm run eval -- t` four times. The eval filter matches by substring, so "t" selected nearly every case, and the output went to `/dev/null`. It was caught on reading the command back after it timed out, and stopped within about a minute (spend checked: $0.34 of $5 used in total). Lesson: one purpose per command, and eval runs always use a full case id with output kept.
- **Oct 17:** I asked for a local test of knowledge-base edits without restarting the dev server. `knowledge.ts` caches the KB in memory and editing a `.md` file doesn't trigger a reload, so the browser showed the old behaviour while the evals (which load fresh) passed. Stopping the npm task also left the Next.js child process holding port 3000. Caught when the browser and eval results disagreed. Lesson: restart the dev server (and check the port is free) after any `knowledge/` edit.
- **Oct 17:** while adding follow-up questions and contact markers, three Claude edits made through Python scripts went wrong. (1) A script that removed one line from `evals/cases.ts` also dropped the case's closing `},`. Typecheck would have caught it; I saw it in the grep output first. (2) A regex written as `\b` inside a Python string became a backspace character, so the "mentions a button" eval check could never match. A new unit test failed on it. (3) The first "question asks one thing" check flagged "…today? And how big is it?", which is two sentences, not one compound question. The existing unit test caught it, and the check now matches only inside a sentence. Lesson: the same as the editor-tool point below. Every new scorer check also gets a unit test with a passing and a failing example before it runs against the model.
- **Oct 17:** a Claude change bundled into a restyle commit (05efc0e) widened the "no booking button beside the handoff form" backstop from the reply with the form to every later reply. No failure motivated it, and it went unrecorded in DECISIONS. On prod, a visitor who'd been shown a pricing form then asked how to book a call: the bot said "use the button below" three times and the UI hid the button each time. Unit tests, typecheck and evals all passed, because the evals score the model's tool calls, not what the UI renders. A pasted prod transcript caught it, and the browser replay confirmed the fix (D22). The same session's first prompt fix also regressed an untouched case (healthcare, 1/4), which only showed up by running the old prompt as a baseline. Lessons: a UI filter on model output is a behaviour change and needs its own DECISIONS entry; and when a rerun fails after a prompt edit, run the old prompt before calling it a flake.

## What I'd do differently
- **Probe real model behaviour on day one, not just types.** The three most expensive bugs (duplicate answers, caching silently off, the blank timeout bubble) all passed typecheck and unit tests. Each was found within minutes of looking at real usage numbers or a real stream. Next time, a one-call usage probe and a forced-failure test go in with the first route.
- **Run the reviewer subagent earlier and on smaller diffs.** It found 22 real issues across three reviews, and the large ones would have been cheaper to catch per feature than per phase.
- **Check platform limits before designing around them.** The rate-limit design assumed several firewall rules. Reading the plan limits first would have led straight to the final design (one edge rule plus a cap in code).
- **Use the editor tool, never in-place scripts, for file edits.** One truncated file and a few silent no-op replacements (CRLF line endings) cost more time than they saved.
- **Keep the AI's research separate from the facts.** The research subagent's notes were good, but some were paraphrased. Keeping facts in `knowledge/` with a source on every line, plus a human check, is what made "no invented facts" credible. I'd keep that process and add an automated freshness check.
