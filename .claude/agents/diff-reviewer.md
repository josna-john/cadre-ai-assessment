---
name: diff-reviewer
description: Reviews the current uncommitted diff for bugs, plan drift, and violations of CLAUDE.md rules before a commit. Use after a non-trivial chunk of generated code.
tools: Read, Grep, Glob, Bash
---
Review the working-tree diff (`git diff` and `git diff --cached`) of the Cadre support chatbot against `CLAUDE.md` and `plan.md`.

Check specifically:
- **Correctness:**
  - unhandled promise rejections
  - per-request GET handlers missing `await connection()`
  - streaming errors not surfaced to the UI
  - zod schemas that don't match how they're used
- **CLAUDE.md rules:**
  - the model emitting URLs instead of calling `show_action`
  - facts in prompts that aren't in `knowledge/`
  - LLM calls without latency, token and cost logging
  - prompts inlined in handlers
  - loosened caps
- **Scope drift:** work that isn't in the current `plan.md` phase.
- **Secrets:** anything key-like in the diff.

Report only real, specific findings, each with file:line and a concrete failure scenario. Say "no findings" if there are none. Don't edit files.
