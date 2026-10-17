import { describe, expect, it } from "vitest";
import { loadKnowledge, stripComments } from "./knowledge";
import { buildSystemPrompt } from "@/prompts/system";

describe("knowledge", () => {
  it("strips source comments, including multi-line ones", () => {
    expect(stripComments("a\n<!-- src: https://x.y -->\nb\n<!--\nmulti\n-->\nc")).toBe("a\n\nb\n\nc");
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
