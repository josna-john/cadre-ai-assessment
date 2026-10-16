// Runs every eval case through the production chat path (src/lib/chat.ts) and
// scores the replies deterministically. Spends real budget (about $0.001 per
// case), so run it deliberately: `npm run eval`, or `npm run eval -- <id-filter>`.
//
// Needs OPENROUTER_API_KEY. Run via `tsx --env-file=.env.local`.
import type { UIMessage } from "ai";
import type { ActionId } from "@/lib/actions";
import type { HandoffOffer } from "@/lib/handoff";
import { MODELS } from "@/lib/ai";
import { streamChat, summarizeSteps } from "@/lib/chat";
import { type EvalCase, cases } from "./cases";
import { score } from "./score";

function toMessages(input: EvalCase["input"]): UIMessage[] {
  const turns = typeof input === "string" ? [{ role: "user" as const, text: input }] : input;
  return turns.map((t, i) => ({ id: `m${i}`, role: t.role, parts: [{ type: "text", text: t.text }] }));
}

async function runCase(c: EvalCase) {
  const started = Date.now();
  const result = await streamChat(toMessages(c.input));
  const [text, toolResults, steps, finishReason] = await Promise.all([
    result.text,
    result.toolResults,
    result.steps,
    result.finishReason,
  ]);
  const actions = toolResults.flatMap((r) =>
    r.toolName === "show_action" ? (r.output as { actions: { id: ActionId }[] }).actions.map((a) => a.id) : [],
  );
  const handoff = toolResults.find((r) => r.toolName === "offer_handoff")?.output as HandoffOffer | undefined;
  return { text, actions, handoff, finishReason, ms: Date.now() - started, ...summarizeSteps(steps) };
}

async function main() {
  const filter = process.argv[2];
  const selected = filter ? cases.filter((c) => c.id.includes(filter)) : cases;
  console.log(`Running ${selected.length} case(s) against ${MODELS.chat}\n`);

  const rows = [];
  const failures: { id: string; reasons: string[]; text: string; actions: string[]; handoff?: HandoffOffer }[] = [];

  // Sequential on purpose: keeps latency numbers honest and is gentle on rate limits.
  for (const c of selected) {
    try {
      const r = await runCase(c);
      const reasons = score(c, r);
      rows.push({ id: c.id, covers: c.covers, pass: reasons.length === 0 ? "✓" : "✗", ms: r.ms, costUsd: r.costUsd.toFixed(5), actions: r.actions.join(","), handoff: r.handoff?.topic ?? "" });
      if (reasons.length) failures.push({ id: c.id, reasons, text: r.text, actions: r.actions, handoff: r.handoff });
    } catch (err) {
      rows.push({ id: c.id, covers: c.covers, pass: "ERR", ms: 0, costUsd: "0", actions: "", handoff: "" });
      failures.push({ id: c.id, reasons: [String(err)], text: "", actions: [] });
    }
  }

  console.table(rows);
  for (const f of failures) {
    console.log(`\n✗ ${f.id}\n  reasons: ${f.reasons.join("; ")}\n  actions: [${f.actions.join(", ")}]\n  reply: ${f.text}`);
  }

  const passed = rows.filter((r) => r.pass === "✓").length;
  const latencies = rows.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? 0;
  const cost = rows.reduce((n, r) => n + Number(r.costUsd), 0);
  console.log(`\n${passed}/${rows.length} passed · p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · total $${cost.toFixed(4)}`);
  process.exitCode = passed === rows.length ? 0 : 1;
}

main();
