import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { sourceIdForUrl } from "./sources";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

const SRC_COMMENT = /<!--\s*src:([\s\S]*?)-->/g;
const URL = /https?:\/\/[^\s;,)]+/g;

// Source URLs live in HTML comments so maintainers can trace every fact. The
// model never sees the URLs: each `<!-- src: … -->` becomes a tag with the
// source ids it can cite ("(source: ai_strategy)"; D18), and every other
// comment is dropped.
export function stripComments(markdown: string): string {
  return markdown
    .replace(SRC_COMMENT, (_, urls: string) => {
      const ids = [...new Set((urls.match(URL) ?? []).map(sourceIdForUrl).filter(Boolean))];
      return ids.length ? `(source: ${ids.join(", ")})` : "";
    })
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Every URL cited in a KB source comment, for the coverage test.
export function sourceUrls(markdown: string): string[] {
  return [...markdown.matchAll(SRC_COMMENT)].flatMap((m) => m[1].match(URL) ?? []);
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
