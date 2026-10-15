// PreToolUse hook: blocks `git commit` when the staged diff contains something
// that looks like a credential. Cheap insurance for a public repo.
import { execSync } from "node:child_process";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const command = JSON.parse(input || "{}")?.tool_input?.command ?? "";
  if (!/\bgit\b[^|;&]*\bcommit\b/.test(command)) process.exit(0);

  const diff = execSync("git diff --cached -U0", { encoding: "utf8" });
  const patterns = [
    /sk-or-v1-[a-f0-9]{16,}/i, // OpenRouter key
    /\bsk-[A-Za-z0-9_-]{20,}/, // OpenAI-style key
    /^\+\s*[A-Z0-9_]*(KEY|SECRET|TOKEN)=\S+/m, // env assignment with a value
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, // JWT (e.g. Supabase service role)
  ];
  const hit = patterns.find((p) => p.test(diff));
  if (hit) {
    console.error(
      `Blocked commit: staged diff matches secret pattern ${hit}. ` +
        "Unstage it and keep secrets in .env.local / Vercel env vars.",
    );
    process.exit(2);
  }
});
