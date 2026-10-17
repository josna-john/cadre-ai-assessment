import { describe, expect, it } from "vitest";
import { ACTIONS, actionIdSchema, resolveActions } from "./actions";

describe("actions", () => {
  it("maps ids to fixed links, deduped, in the model's order", () => {
    expect(resolveActions(["maturity_index", "book_call", "maturity_index"])).toEqual([
      { id: "maturity_index", ...ACTIONS.maturity_index },
      { id: "book_call", ...ACTIONS.book_call },
    ]);
  });

  it("drops the generic case studies button when an industry page is shown", () => {
    expect(resolveActions(["industry_hospitality", "case_studies", "book_call"]).map((a) => a.id)).toEqual([
      "industry_hospitality",
      "book_call",
    ]);
    expect(resolveActions(["case_studies", "book_call"]).map((a) => a.id)).toEqual(["case_studies", "book_call"]);
  });

  it("rejects ids that aren't in the enum, so the model can't invent a link", () => {
    expect(actionIdSchema.safeParse("calendly").success).toBe(false);
  });

  it("has a page for each of Cadre's nine industries", () => {
    const industries = Object.entries(ACTIONS).filter(([id]) => id.startsWith("industry_"));
    expect(industries).toHaveLength(9);
    for (const [, { href }] of industries) expect(href).toMatch(/^https:\/\/cadre\.ai\/industries\/[a-z-]+$/);
  });

  it("links each case study to its card on the case studies page", () => {
    const studies = Object.entries(ACTIONS).filter(([id]) => id.startsWith("case_study_"));
    expect(studies).toHaveLength(8);
    for (const [, { href }] of studies) {
      const [page, fragment] = href.split("#:~:text=");
      expect(page).toBe("https://cadre.ai/case-studies");
      // "-" and "," are text-fragment syntax: unescaped, they'd change the match.
      expect(fragment).toMatch(/^[^-,]+$/);
      expect(decodeURIComponent(fragment).length).toBeGreaterThan(10);
    }
  });

  it("only links to Cadre-owned destinations", () => {
    for (const { href } of Object.values(ACTIONS)) {
      expect(href).toMatch(/^(https:\/\/(cadre\.ai|portal\.gocadre\.ai)(\/|$)|mailto:hello@gocadre\.ai$|tel:\+1\d{10}$)/);
    }
  });
});
