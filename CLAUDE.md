# CLAUDE.md: Cadre AI Support Chatbot

A public customer support chatbot for Cadre AI, an AI strategy and implementation consultancy. It answers common inbound questions (what Cadre does, industries, booking a call, the client portal, the AI Maturity Index, LLM selection and security) **only from a curated knowledge base**. Anything it can't answer becomes a consented, structured handoff to Cadre's inbound team.

- **Scope and sequencing:** [`plan.md`](plan.md). Read it before starting any task, and tick its checklist when a requirement ships.
- **Requirements:** [`docs/BRIEF.md`](docs/BRIEF.md). It overrides everything else here.

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Local dev server. Needs `.env.local` (copy `.env.example`). |
| `npm run typecheck` / `npm test` / `npm run lint` | Must pass before every commit. Use `/preflight`. |
| `npm run eval` | Runs the eval set against the **real model**. It costs money, so see "Budget". |
| `curl localhost:3000/api/health/ai` | End-to-end LLM check: auth, structured output, latency, cost. |
| `node --env-file=.env.local scripts/verify-handoff.mjs <baseUrl>` | Handoff smoke test against the real DB (cleans up after itself). |

Project slash commands live in `.claude/commands/`:
- `/preflight`: typecheck, tests, lint and a secrets scan.
- `/eval`: runs the evals and records the results.
- `/kb-add <topic>`: research a topic and update the knowledge base.
- `/ship`: preflight, commit, push, then smoke-test prod.
- `/budget`: OpenRouter spend remaining.

Subagents live in `.claude/agents/`:
- `kb-researcher`
- `eval-triager`
- `diff-reviewer`

## Architecture (where things go)
```
knowledge/*.md          Curated facts about Cadre. Every fact has a source URL. The ONLY source of truth for answers.
src/prompts/            System prompt pieces, one file per concern, with comments explaining WHY each rule exists.
src/lib/ai.ts           Model config (OpenRouter). Changing model = editing one string here.
src/lib/actions.ts      Fixed enum of CTA actions → URLs. The model picks an action; it never writes URLs.
src/lib/handoff.ts      Handoff topics + zod schemas (shared with the browser: no secrets).
src/lib/handoff-store.ts  Server-only Supabase insert. The single seam to swap for a CRM.
supabase/migrations/    Schema. Apply with `npx supabase db push --db-url "$POSTGRES_URL_NON_POOLING"`.
scripts/verify-handoff.mjs  Smoke test: POST a handoff, check RLS blocks the public key, delete the row.
src/app/api/chat/       Streaming chat route: validate → cap → prompt → stream → log.
evals/                  Scripted conversations + deterministic scorers (`npm run eval`).
```

## Rules for this codebase
1. **No invented facts.**
   - If `knowledge/` doesn't say it, the bot doesn't say it: it redirects or offers a handoff.
   - New facts are added only through `/kb-add`, with a source URL, and reviewed by a human before commit.
   - Pricing, portal access process, Maturity Index scoring and Cadre's own certifications are **not public**. The bot must escalate on those, never guess.
2. **The model never emits URLs, emails or phone numbers.** It calls `show_action` with an enum value, and `src/lib/actions.ts` maps that to the link. If a new link is needed, add an enum value. Don't put it in the prompt.
3. **Deterministic code for deterministic things.** Validation, caps, rate limits, link mapping and eval scoring are plain TypeScript. The LLM handles language and judgment only.
4. **Structured output with zod** for every tool input and handoff. No regex over model text.
5. **Prompts are code.** They live in `src/prompts/`, not inline in handlers. Every rule gets a one-line comment saying which failure it prevents. When you change a prompt, run `/eval` and record the result.
6. **Every LLM call logs** model, latency, input/output tokens and `costUsd` (from OpenRouter usage accounting, `costUsd()` in `src/lib/ai.ts`).
7. **Failure states are features.** Timeouts, provider errors, oversized input and refusals each have a defined UI state. Never show a blank bubble or a stack trace.

## Budget (read before calling the model)
- The chatbot runs on an OpenRouter key with a **hard $5 limit**. That one key pays for dev, evals and public traffic.
- The key is for the chatbot's runtime only. Don't use it for coding assistance or ad-hoc experiments.
- Check spend with `/budget`.
- Production caps (input length, history length, output tokens, rate limit) exist to protect this budget. Don't loosen them without a reason in `docs/DECISIONS.md`.
- A Haiku 5.5 health check costs about $0.00004. A chat turn costs about $0.0003 with a warm prompt cache, or $0.0009 on a cache write (D7). A full eval run costs about $0.01.
- Rate limits: one Vercel Firewall rule (20 POST/min per IP on `/api/*`) plus a 5-per-10-min handoff cap in code (D8). Don't add a cap that the platform refuses; record the reason in DECISIONS instead.

## Next.js 16 / AI SDK 7 gotchas
- Read `AGENTS.md`. This Next version has breaking changes, so check `node_modules/next/dist/docs/` before Next-specific code.
- **Cache Components is on:** a GET route handler that touches no request data is prerendered at build time. Call `await connection()` in anything that must run per request (see `src/app/api/health/ai/route.ts`).
- AI SDK 7: check `node_modules/ai/docs/` instead of memory. Structured output is `generateText` + `Output.object`. The provider is `@openrouter/ai-sdk-provider`, not the Vercel AI Gateway.

## Workflow
- **One phase of `plan.md` at a time.**
  - Each phase ends with a production deploy (push to `main`) and a smoke test of https://cadre-ai-assessment-omega.vercel.app.
  - Then tick the phase in `plan.md`.
- **Small commits** with messages that describe the engineering change. Run `/preflight` before each one.
  - A PreToolUse hook (`.claude/hooks/block-secrets.mjs`) blocks `git commit` if the staged diff contains a key.
- **Parallelize with subagents** when tasks are independent, e.g. KB research while building UI, or eval triage while fixing code. Review their output before using it, because subagent research can paraphrase.
- **When Claude-generated code is wrong,** record what was wrong and how it was caught in `docs/AI_USAGE.md`.
- **Decisions** (chosen, rejected, why) go in `docs/DECISIONS.md` as they're made, not at the end.

## Repo and deploy
- GitHub `josna-john/cadre-ai-assessment` (public). Vercel team `josna-john-s-projects`: always pass `--scope josna-john-s-projects` to the CLI.
- Secrets live in `.env.local` (gitignored) and Vercel env vars. Keep `.env.example` current.
- Submission is a zip **including `.git`**. Build it from a fresh `git clone` so untracked local files never ship.

## Definition of done
- [ ] Every requirement in `plan.md` is checked off or marked out of scope with a reason.
- [ ] Prod URL works in an incognito window. The happy path, a handoff and one error path are tested on prod.
- [ ] `npm test`, `npm run typecheck` and `npm run eval` pass, and the eval results are recorded in `docs/DECISIONS.md`.
- [ ] The README has the live URL, setup, env vars and a mermaid architecture diagram.
- [ ] `docs/DECISIONS.md` and `docs/AI_USAGE.md` are filled in. No secrets in git history.
