export type EvalCase = {
  id: string;
  input: string;
  // Substrings the output must contain (case-insensitive).
  mustInclude?: string[];
  // Substrings the output must not contain (case-insensitive).
  mustExclude?: string[];
};

// Placeholder cases; replace once the brief arrives.
export const cases: EvalCase[] = [
  { id: "smoke-include", input: "hello cadre", mustInclude: ["cadre"] },
  { id: "smoke-exclude", input: "hello cadre", mustExclude: ["error"] },
];
