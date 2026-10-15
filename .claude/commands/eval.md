---
description: Run the eval set against the real model and record results
argument-hint: "[optional case id filter]"
---
Run the chatbot eval set and record the outcome.

1. Check the budget first by running the `/budget` steps. If less than $0.50 remains, stop and ask before running.
2. Run `npm run eval $ARGUMENTS` and capture the table output.
3. Summarize: pass rate, failed case ids, p50/p95 latency, total cost.
4. For failures, delegate to the `eval-triager` subagent with the failing transcripts. It returns a root cause per failure (prompt, KB gap, scorer too strict, or code bug) and a minimal proposed fix. Review its proposal before applying anything.
5. Append a dated row to the "Eval log" table in `docs/DECISIONS.md` with these columns: date, git short SHA, model, pass rate, cost, notable changes.
