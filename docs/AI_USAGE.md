# How AI Tools Were Used

A running log of how AI tools were used to build this project, with concrete examples of what worked and what had to be corrected.

## Tools
- **Claude Code** (Opus 5.5): planning, scaffolding, implementation, tests, docs
- _others_

## Workflow
- `CLAUDE.md` holds project context, deadlines, conventions, and the definition of done, so every session starts aligned.
- Plan first (`docs/PLAN.md`), then build in small reviewed increments, with a deploy after each one.

## Log
| When | Task | What AI did | What I changed / verified myself |
|---|---|---|---|
| Oct 14 | Project setup | Drafted CLAUDE.md, the doc skeletons, and the git repo | Supplied the context, reviewed the structure |
| Oct 14 | GitHub + Vercel setup | Scaffolded Next.js 16, created the public repo, linked Vercel, deployed. Caught Vercel re-adding `.env*` to .gitignore, which would have hidden .env.example | Logged into Vercel and GitHub, installed the Vercel GitHub app |
| Oct 14 | AI pipeline smoke test | Built `/api/health/ai` (structured output + usage) and deployed it before any feature work. It surfaced two blockers on day 0: the gateway needed a card on file, then the free tier excluded current Claude models | Added billing and $10 paid credit. Kept current models rather than downgrading to save $10 |

## Where AI fell short / what I had to correct
- 

## What I'd do differently
- 
