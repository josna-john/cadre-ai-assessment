import { describe, expect, it } from "vitest";
import { SOURCES, citedSources, markerIds, sourceIdForUrl, splitCitations, stripMarkers } from "./sources";

describe("SOURCES", () => {
  it("only links to Cadre-owned pages", () => {
    for (const { href } of Object.values(SOURCES)) {
      expect(href).toMatch(/^https:\/\/(cadre\.ai|portal\.gocadre\.ai)(\/|$|#)/);
    }
  });

  it("has a page for each of Cadre's nine industries", () => {
    const industries = Object.entries(SOURCES).filter(([id]) => id.startsWith("industry_"));
    expect(industries).toHaveLength(9);
    for (const [, { href }] of industries) expect(href).toMatch(/^https:\/\/cadre\.ai\/industries\/[a-z-]+$/);
  });

  it("links each case study to its card on the case studies page", () => {
    const studies = Object.entries(SOURCES).filter(([id]) => id.startsWith("case_study_"));
    expect(studies).toHaveLength(8);
    for (const [, { href }] of studies) {
      const [page, fragment] = href.split("#:~:text=");
      expect(page).toBe("https://cadre.ai/case-studies");
      // "-" and "," are text-fragment syntax: unescaped, they'd change the match.
      expect(fragment).toMatch(/^[^-,]+$/);
      expect(decodeURIComponent(fragment).length).toBeGreaterThan(10);
    }
  });

  it("maps a KB source URL to its id, ignoring a trailing slash", () => {
    expect(sourceIdForUrl("https://cadre.ai/strategy")).toBe("ai_strategy");
    expect(sourceIdForUrl("https://cadre.ai/strategy/")).toBe("ai_strategy");
    expect(sourceIdForUrl("https://cadre.ai/nope")).toBeUndefined();
  });
});

describe("citation markers", () => {
  const reply = "Cadre runs a 45-day program.[[src:transformation_intensive]] It also builds agents.[[src:ai_agents]]";

  it("lists known cited ids, deduped", () => {
    expect(citedSources(reply + "[[src:ai_agents]][[src:made_up]]")).toEqual(["transformation_intensive", "ai_agents"]);
    expect(markerIds("x[[src:made_up]]")).toEqual(["made_up"]);
  });

  it("splits prose and citations, dropping unknown ids", () => {
    expect(splitCitations("A fact.[[src:ai_agents]] Made up.[[src:nope]] End")).toEqual([
      { kind: "text", text: "A fact." },
      { kind: "source", id: "ai_agents" },
      { kind: "text", text: " Made up." },
      { kind: "text", text: " End" },
    ]);
  });

  it("hides a marker that's still streaming in", () => {
    for (const partial of ["[", "[[", "[[s", "[[src", "[[src:", "[[src:ai_ag", "[[src:ai_agents]"]) {
      expect(splitCitations("A fact." + partial)).toEqual([{ kind: "text", text: "A fact." }]);
    }
  });

  it("strips markers to plain prose", () => {
    expect(stripMarkers(reply)).toBe("Cadre runs a 45-day program. It also builds agents.");
    expect(stripMarkers("Cadre builds agents [[src:ai_agents]].")).toBe("Cadre builds agents.");
  });
});
