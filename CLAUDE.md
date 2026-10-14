# CLAUDE.md

Project conventions for working in this repo with Claude Code. The requirements live in `docs/BRIEF.md` and override any default below.

## Default stack (use unless the brief says otherwise)
- **Next.js 16 (App Router) + TypeScript**, deployed on **Vercel**. **Read `AGENTS.md`**: this Next version has breaking changes, so check `node_modules/next/dist/docs/` before writing Next-specific code. Cache Components is enabled, so GET route handlers that touch no request data are prerendered at build time. Use `await connection()` for anything that must run per request.
- **AI SDK 7** for LLM calls, streaming, tool calling, and structured output (`generateText` + `Output.object` with zod). Check `node_modules/ai/docs/` instead of relying on older SDK patterns.
  - Models are configured in one place, `src/lib/ai.ts`, as Vercel AI Gateway `"provider/model"` strings, so changing provider or model is a config change.
- **Data:** Supabase (Postgres + pgvector) only if persistence or RAG is needed. Don't add infrastructure the brief doesn't need.
- **UI:** Tailwind (+ shadcn/ui if needed).
- **Tests:** Vitest (`npm test`) for logic, plus the eval harness (`npm run eval`) for LLM behavior.

## Repo, accounts & deploy
- GitHub: public repo `josna-john/cadre-ai-assessment`. Local git identity: `Josna John <josnajohn72@gmail.com>`.
- Vercel: team `josna-john-s-projects` (always pass `--scope josna-john-s-projects`). Production: https://cadre-ai-assessment-omega.vercel.app. A push to `main` deploys to production, and other branches get preview URLs.
- `/api/health/ai` is an end-to-end check of the LLM path (gateway auth, structured output, usage).

## How to work in this repo
- **Plan first:** turn the brief into `docs/PLAN.md` (a requirements checklist quoted from the brief, assumptions, MVP vs. stretch goals, architecture), and confirm it before building.
- **Deploy early and often.** Every meaningful step leaves a working production deploy.
- Commit small and often, with clear messages describing the engineering change.
- Secrets live in `.env.local` (gitignored) and Vercel env vars. Never commit keys, and keep `.env.example` current.
- LLM features need:
  - Structured outputs validated with zod, not regex on free text.
  - Graceful failure states in the UI (timeouts, refusals, bad input).
  - An eval set in `evals/` (10 to 20 cases covering happy paths, edge cases, and inputs that should be refused).
  - Logging of latency and token usage, so cost and scaling decisions are grounded in real numbers.
  - Deterministic code for anything with a single right answer (math, lookups, rules). The LLM handles language and judgment.
- Prompts live in their own files or constants with comments explaining why, not inline in handlers.
- Readable beats clever.

## Docs (update as we go, not at the end)
- `docs/BRIEF.md`: the brief, verbatim.
- `docs/PLAN.md`: requirements checklist, scope, and architecture.
- `docs/DECISIONS.md`: decision log (chosen, rejected, why) plus next steps and scaling.
- `docs/AI_USAGE.md`: how AI tools were used, what had to be corrected, and what was done by hand.
- `README.md`: what it is, live URL, how to run it, architecture diagram, links to the docs.

## Definition of done
- [ ] Every requirement in `docs/BRIEF.md` is checked off in `docs/PLAN.md`, or marked out of scope with a reason.
- [ ] The production URL works in an incognito window. The happy path and one error path are both tested.
- [ ] The README has the live URL, setup steps, env vars, and an architecture diagram (mermaid).
- [ ] `npm test`, `npm run eval`, and `npm run typecheck` pass, and the eval results are recorded.
- [ ] `docs/DECISIONS.md` and `docs/AI_USAGE.md` are filled in.
- [ ] No secrets in git history.
