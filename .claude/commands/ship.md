---
description: Preflight, commit, push to main (production deploy), and smoke-test prod
argument-hint: "<commit message summary>"
---
Ship the current change to production.

1. Run the `/preflight` checks. Stop on any failure.
2. Show `git status` and the staged file list. Stage only files related to the change, never `private/`, `.env*` or PDFs.
3. Commit with a message describing the engineering change, using $ARGUMENTS as the summary line.
4. Run `git push origin main`. This triggers a Vercel production deploy.
5. Wait for the deploy: repeat `npx vercel ls --scope josna-john-s-projects 2>&1` until the newest deployment is Ready. The CLI prints its table to **stderr**, so without `2>&1` the poll never sees "Ready". Then smoke-test https://cadre-ai-assessment-omega.vercel.app:
   - `GET /api/health/ai` returns `ok: true`
   - the home page returns 200
   - once `/api/chat` exists, one real question returns a streamed answer
6. Report the deploy URL and the smoke-test results. If prod is broken, say so plainly and propose a fix or a rollback.
