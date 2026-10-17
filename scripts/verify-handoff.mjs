// Verifies: a real POST lands in the table, the public key can't read it, then cleans up.
// Run from the repo: node --env-file=.env.local <this file> <baseUrl> [strategy]
// With "strategy", sends a strategist request with no chat (D19): first
// without the required note (expects 400), then with it.
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3000";
const strategy = process.argv[3] === "strategy";
const marker = `verify-${Date.now()}`;

const post = (extra) =>
  fetch(`${base}/api/handoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: strategy ? "strategy_call" : "pricing",
      summary: `Automated check ${marker}`,
      firstName: "Test",
      lastName: "Runner",
      email: "test@example.com",
      company: "Verify Script",
      transcript: strategy ? [] : [{ role: "user", text: "How much does it cost?" }],
      ...extra,
    }),
  });

if (strategy) {
  const missing = await post({});
  console.log("POST without note:", missing.status, await missing.text());
}
const res = await post(strategy ? { note: "Automating our intake process" } : {});
console.log("POST status:", res.status, await res.text());

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: rows, error } = await admin.from("handoffs").select("id, topic, status, summary, first_name, last_name, name, company").eq("summary", `Automated check ${marker}`);
console.log("server key sees:", error ?? rows);

const pub = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const r1 = await pub.from("handoffs").select("id").limit(1);
console.log("publishable key read:", r1.error ? `blocked (${r1.error.code} ${r1.error.message})` : `RETURNED ${r1.data.length} rows`);
const r2 = await pub.from("handoffs").insert({ topic: "other", summary: "x", name: "x", email: "x@x.co" });
console.log("publishable key insert:", r2.error ? `blocked (${r2.error.code})` : "ALLOWED");

if (rows?.length) {
  const del = await admin.from("handoffs").delete().in("id", rows.map((r) => r.id));
  console.log("cleanup:", del.error ?? "deleted test row");
}
