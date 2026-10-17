import { describe, expect, it } from "vitest";
import { ACTIONS, CONTACTS, actionIdSchema, fillContacts, resolveActions } from "./actions";

describe("actions", () => {
  it("fills contact markers from code, matching the buttons, and drops unknown ids", () => {
    expect(fillContacts("Call [[contact:phone]] or email [[contact:email]].")).toBe(
      `Call ${CONTACTS.phone} or email ${CONTACTS.email}.`,
    );
    expect(ACTIONS.call_team.label).toContain(CONTACTS.phone);
    expect(ACTIONS.email_team.href).toBe(`mailto:${CONTACTS.email}`);
    expect(fillContacts("Fax [[contact:fax]].")).toBe("Fax .");
  });

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
