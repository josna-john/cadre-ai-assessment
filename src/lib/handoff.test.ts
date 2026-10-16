import { describe, expect, it } from "vitest";
import {
  HANDOFF_SUMMARY_MAX,
  HANDOFF_TOPICS,
  HANDOFF_TRANSCRIPT_TURNS,
  clipSummary,
  handoffSubmissionSchema,
  transcriptOf,
  validateField,
} from "./handoff";

const valid = {
  topic: "pricing",
  summary: "Wants pricing for the AI Transformation Intensive.",
  firstName: "  Ada ",
  lastName: "Lovelace",
  email: "ada@example.com",
  company: "Analytical Engines Ltd",
  phone: "",
  transcript: [{ role: "user", text: "How much is the Intensive?" }],
};

describe("handoffSubmissionSchema", () => {
  it("accepts a valid submission, trims, and drops empty optional fields", () => {
    const r = handoffSubmissionSchema.parse(valid);
    expect(r.firstName).toBe("Ada");
    expect(r.phone).toBeUndefined();
  });

  it("requires what cadre.ai/contact requires: first and last name, company, email", () => {
    const r = handoffSubmissionSchema.safeParse({ ...valid, email: "not-an-email", firstName: " ", lastName: "", company: " " });
    expect(r.success).toBe(false);
    const fields = r.error?.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["email", "firstName", "lastName", "company"]));
  });

  it("accepts an E.164 phone number (what the form sends) and rejects anything else", () => {
    expect(handoffSubmissionSchema.safeParse({ ...valid, phone: "+16195550100" }).success).toBe(true);
    for (const phone of ["call me maybe", "6195550100", "+1 (619) 555-0100"]) {
      const bad = handoffSubmissionSchema.safeParse({ ...valid, phone });
      expect(bad.error?.issues.map((i) => i.path[0])).toEqual(["phone"]);
    }
  });

  it("validates single fields for on-blur checks, with the same messages as submit", () => {
    expect(validateField("email", "ada@example")).toBe("Please enter a valid email address.");
    expect(validateField("email", "ada@example.com")).toBeUndefined();
    expect(validateField("company", "")).toBe("Please enter your company name.");
  });

  it("rejects topics outside the enum (the model can't invent a queue)", () => {
    expect(handoffSubmissionSchema.safeParse({ ...valid, topic: "urgent_vip" }).success).toBe(false);
  });

  it("caps the transcript so the form can't be used to store bulk data", () => {
    const transcript = Array.from({ length: HANDOFF_TRANSCRIPT_TURNS + 1 }, () => ({ role: "user", text: "hi" }));
    expect(handoffSubmissionSchema.safeParse({ ...valid, transcript }).success).toBe(false);
  });
});

describe("transcriptOf", () => {
  it("keeps text only, skips empty turns, and keeps the newest turns", () => {
    const messages = [
      { role: "system", parts: [{ type: "text", text: "secret" }] },
      ...Array.from({ length: 12 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        parts: [{ type: "text", text: `t${i}` }, { type: "tool-show_action" }],
      })),
      { role: "assistant", parts: [{ type: "tool-offer_handoff" }] },
    ];
    const t = transcriptOf(messages);
    expect(t).toHaveLength(HANDOFF_TRANSCRIPT_TURNS);
    expect(t.at(-1)).toEqual({ role: "assistant", text: "t11" });
    expect(t.some((x) => x.text === "secret")).toBe(false);
  });
});

describe("HANDOFF_TOPICS", () => {
  it("matches the CHECK constraint in the migration (a drift would make inserts fail)", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = "supabase/migrations";
    const sql = readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
    const list = /topic in \(([^)]*)\)/.exec(sql)?.[1] ?? "";
    const inSql = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(inSql.sort()).toEqual(Object.keys(HANDOFF_TOPICS).sort());
  });
});

describe("clipSummary", () => {
  it("clips to the cap without splitting an emoji", () => {
    const s = clipSummary("a".repeat(HANDOFF_SUMMARY_MAX - 1) + "😀 tail");
    expect(s.length).toBeLessThanOrEqual(HANDOFF_SUMMARY_MAX);
    expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
    expect(/[\uD800-\uDBFF]$/.test(s)).toBe(false);
  });
});

describe("handoffSubmissionSchema NUL handling", () => {
  it("rejects NUL characters that Postgres would refuse", () => {
    expect(handoffSubmissionSchema.safeParse({ ...valid, firstName: "Ada\0" }).success).toBe(false);
  });
});
