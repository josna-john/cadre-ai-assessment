import type { EvalCase } from "./cases";

// Deterministic checks first. Add an LLM-as-judge scorer here only for
// criteria that can't be checked with code.
export function score(c: EvalCase, actual: string): boolean {
  const text = actual.toLowerCase();
  const includesOk = (c.mustInclude ?? []).every((s) => text.includes(s.toLowerCase()));
  const excludesOk = (c.mustExclude ?? []).every((s) => !text.includes(s.toLowerCase()));
  return includesOk && excludesOk;
}
