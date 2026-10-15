import { describe, expect, it } from "vitest";
import { ACTIONS, actionIdSchema, resolveActions } from "./actions";

describe("actions", () => {
  it("maps ids to fixed links, deduped, in the model's order", () => {
    expect(resolveActions(["maturity_index", "book_call", "maturity_index"])).toEqual([
      { id: "maturity_index", ...ACTIONS.maturity_index },
      { id: "book_call", ...ACTIONS.book_call },
    ]);
  });

  it("rejects ids that aren't in the enum, so the model can't invent a link", () => {
    expect(actionIdSchema.safeParse("calendly").success).toBe(false);
  });

  it("only links to Cadre-owned destinations", () => {
    for (const { href } of Object.values(ACTIONS)) {
      expect(href).toMatch(/^(https:\/\/(cadre\.ai|portal\.gocadre\.ai)(\/|$)|mailto:hello@gocadre\.ai$|tel:\+1\d{10}$)/);
    }
  });
});
