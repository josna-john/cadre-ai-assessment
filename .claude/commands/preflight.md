---
description: Typecheck, test, lint, and scan staged changes for secrets before committing
---
Run the pre-commit checks for this repo and report a one-line verdict per check.

1. `npm run typecheck`
2. `npm test`
3. `npm run lint`
4. Secrets scan of what is about to be committed: run `git diff --cached` (or `git diff` if nothing is staged) and look for:
   - API keys: `sk-or-`, `sk-`, and `eyJ` JWTs
   - `.env` values
   - service-role keys

   Also confirm that none of these is staged:
   - any file under `private/`
   - any `.env*` file other than `.env.example`
   - any PDF

If anything fails, show the relevant error output and propose the smallest fix. Do not commit. Do not run `npm run eval` here (it spends the model budget).
