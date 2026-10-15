# How AI Tools Were Used

A running log of how AI tools were used to build this project, with concrete examples of what worked and what had to be corrected.

## Tools
- **Claude Code** (Opus 5.5): planning, scaffolding, implementation, tests, docs
- _others_

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
| Oct 14 | GitHub + Vercel setup | Scaffolded Next.js 16, created the public repo, linked Vercel, deployed. Caught Vercel re-adding `.env*` to .gitignore, which would have hidden .env.example | Logged into Vercel and GitHub, installed the Vercel GitHub app |
| Oct 15 | Brief → plan | Read the brief and turned it into `plan.md` (requirements table, product boundaries, phases). Asked me to decide deadline, knowledge source, escalation design and model | Made the four calls, then had the plan walked through a second time before approving |
| Oct 15 | KB research | Ran a background subagent over cadre.ai (sitemap, service pages, portal, case studies) while planning continued. It found there is no booking calendar (all CTAs go to the contact form) and no public pricing, which changed the action design | Will review every fact against its source page before it enters `knowledge/` |
| Oct 15 | OpenRouter switch | Checked the installed AI SDK docs and npm peer deps before choosing `@openrouter/ai-sdk-provider`. Verified the key and model IDs via OpenRouter's free endpoints, then ran a real health check | |
| Oct 15 | Chat UI (parallel) | A background subagent built `src/components/chat/*` against a written contract (`src/lib/actions.ts`, `src/lib/limits.ts`, the error JSON shape) while the main session wrote the route, KB and prompt. It reported where AI SDK 7 differed from the contract (the error shape) and fixed a Next 16 prerender failure (a random chat ID under Cache Components) | Reviewed its report, then verified the UI end to end in a real browser (Playwright) against the live model |
| Oct 15 | Chat route + KB | Checked the installed AI SDK 7 type definitions before writing the route, and found `onFinish` is deprecated in favour of `onEnd`. Wrote the KB from the research subagent's notes, leaving out everything marked UNVERIFIED | |
| Oct 15 | Handoff (Phase 3) | Loaded the Vercel Marketplace and Supabase agent skills before writing code. Provisioned Supabase from the CLI (terms needed one browser click), wrote the migration with RLS on and grants revoked, then built the two-step handoff (model offers, visitor submits). Verified it against the real DB: a row is saved, the publishable key is denied, and the test rows are deleted | Questioned why a table was needed when Cadre already has a contact form. That led to D4 being rewritten around context, routing and the CRM swap point. Accepted the Supabase terms |
| Oct 14 | AI pipeline smoke test | Built `/api/health/ai` (structured output + usage) and deployed it before any feature work. It surfaced two blockers on day 0: the gateway needed a card on file, then the free tier excluded current Claude models | Added billing and $10 paid credit. Kept current models rather than downgrading to save $10 |

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

## What I'd do differently
- 
