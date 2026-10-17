import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadKnowledge, sourceUrls, stripComments } from "./knowledge";
import { sourceIdForUrl } from "./sources";
import { buildSystemPrompt } from "@/prompts/system";

describe("knowledge", () => {
  it("strips other comments, including multi-line ones", () => {
    expect(stripComments("a\n<!--\nmulti\n-->\nc")).toBe("a\n\nc");
  });

  it("turns source comments into citable ids, dropping URLs with no source page", () => {
    expect(stripComments("<!-- src: https://cadre.ai/strategy; https://cadre.ai/ai-transformation-intensive -->\nfact")).toBe(
      "(source: ai_strategy, transformation_intensive)\nfact",
    );
    expect(stripComments("<!-- src: https://x.y -->\nfact")).toBe("fact");
  });

  it("has a citable source page for every URL the KB cites", () => {
    // Every fact can show its source to the visitor, not just to maintainers.
    const urls = readdirSync("knowledge")
      .filter((f) => f.endsWith(".md"))
      .flatMap((f) => sourceUrls(readFileSync(`knowledge/${f}`, "utf8")));
    expect(urls.length).toBeGreaterThan(20);
    expect(urls.filter((u) => !sourceIdForUrl(u))).toEqual([]);
  });

  it("loads every KB file and gives the model no raw URLs or emails", () => {
    const kb = loadKnowledge();
    for (const heading of ["About Cadre AI", "Services", "Getting started", "LLM selection", "Case studies", "Always escalate"]) {
      expect(kb).toContain(heading);
    }
    // Links reach users only via show_action. The model never sees a URL it could repeat.
    expect(kb).not.toMatch(/https?:\/\//);
    expect(kb).not.toMatch(/[\w.]+@[\w-]+\.\w+/);
  });

  it("gives the model no email or phone number anywhere in the full prompt", () => {
    // The KB check above missed the button labels the prompt adds ("Email
    // hello@gocadre.ai"), and the model copied one into a reply.
    const prompt = buildSystemPrompt(loadKnowledge());
    expect(prompt).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
    expect(prompt).not.toMatch(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
    expect(prompt).not.toMatch(/https?:\/\//);
  });

  it("keeps the system prompt within a sane token budget", () => {
    // Rough estimate at ~4 chars/token. A tripwire against accidentally
    // dumping huge content into every request.
    const approxTokens = buildSystemPrompt(loadKnowledge()).length / 4;
    expect(approxTokens).toBeLessThan(8000);
  });
});
