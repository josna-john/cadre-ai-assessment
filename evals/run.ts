// Minimal eval harness: run each case through the system under test, score it,
// and print a pass rate with latency. Run with `npm run eval`.
//
// Once the brief arrives: replace `runCase` with a call into the real feature
// (import from src/lib, not over HTTP) and fill `cases.ts` with 10-20 cases
// covering happy paths, edge cases, and inputs that should be refused.
import { cases, type EvalCase } from "./cases";
import { score } from "./score";

async function runCase(c: EvalCase): Promise<string> {
  // Placeholder system under test.
  return c.input;
}

async function main() {
  const results = [];
  for (const c of cases) {
    const started = Date.now();
    let actual = "";
    let error: string | undefined;
    try {
      actual = await runCase(c);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const passed = !error && score(c, actual);
    results.push({ id: c.id, passed, ms: Date.now() - started, error });
  }

  console.table(results);
  const passed = results.filter((r) => r.passed).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main();
