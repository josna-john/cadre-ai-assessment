import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

// Source URLs live in HTML comments so maintainers can trace every fact.
// They're stripped before the text reaches the model, which keeps tokens down
// and means the model never sees raw URLs it could repeat to users.
export function stripComments(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

let cached: string | undefined;

// The whole KB, concatenated in filename order. Read once per server instance:
// files only change on deploy. next.config.ts traces knowledge/ into the
// serverless bundle.
export function loadKnowledge(): string {
  if (cached === undefined) {
    cached = readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => stripComments(readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8")))
      .join("\n\n");
  }
  return cached;
}
