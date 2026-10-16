import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain stub rather than vi.fn: Vitest 5 reports a vi.fn's rejected promise
// as a test failure even when the route catches it.
let save: (h: unknown, opts: { ip?: string }) => Promise<{ id: string }>;
const saved: unknown[] = [];
vi.mock("@/lib/handoff-store", () => ({
  saveHandoff: (h: unknown, opts: { ip?: string }) => save(h, opts),
  HandoffRateLimitedError: class HandoffRateLimitedError extends Error {},
}));
const { HandoffRateLimitedError } = await import("@/lib/handoff-store");
vi.mock("@/lib/log", () => ({ logEvent: () => {} }));

const { POST } = await import("./route");

const body = {
  topic: "security_compliance",
  summary: "Needs Cadre's SOC 2 report for a vendor review.",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  company: "Analytical Engines Ltd",
  transcript: [{ role: "user", text: "Can you send your SOC 2 report?" }],
};
const post = (b: unknown) =>
  POST(new Request("http://test/api/handoff", { method: "POST", body: typeof b === "string" ? b : JSON.stringify(b) }));

describe("POST /api/handoff", () => {
  beforeEach(() => {
    saved.length = 0;
    save = async (h) => {
      saved.push(h);
      return { id: "h1" };
    };
  });

  it("saves a valid handoff without the honeypot field", async () => {
    const res = await post({ ...body, website: "" });
    expect(res.status).toBe(201);
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty("website");
  });

  it("returns field errors for invalid input and saves nothing", async () => {
    const res = await post({ ...body, email: "nope" });
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.email).toBeTruthy();
    expect(saved).toHaveLength(0);
  });

  it("highlights a missing company, which the lead form now requires", async () => {
    const res = await post({ ...body, company: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.company).toBeTruthy();
    expect(saved).toHaveLength(0);
  });

  it("rejects a well-formed but non-existent phone number with a phone field error", async () => {
    const res = await post({ ...body, phone: "+11234567890" });
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.phone).toBeTruthy();
    expect(saved).toHaveLength(0);
  });

  it("saves a valid international phone number", async () => {
    expect((await post({ ...body, phone: "+442079460958" })).status).toBe(201);
    expect(saved[0]).toMatchObject({ phone: "+442079460958" });
  });

  it("rejects malformed JSON", async () => {
    expect((await post("{")).status).toBe(400);
  });

  it("rejects oversized bodies before parsing", async () => {
    const big = JSON.stringify({ ...body, note: "x".repeat(40_000) });
    const res = await POST(
      new Request("http://test/api/handoff", { method: "POST", body: big, headers: { "content-length": String(big.length) } }),
    );
    expect(res.status).toBe(413);
  });

  it("sends non-field errors to the email fallback instead of a retry loop", async () => {
    const res = await post({ ...body, topic: "urgent_vip" });
    expect(res.status).toBe(422);
    expect((await res.json()).fieldErrors).toBeUndefined();
  });

  it("pretends to succeed for bots that fill the honeypot", async () => {
    const res = await post({ ...body, website: "http://spam.example" });
    expect(res.status).toBe(201);
    expect(saved).toHaveLength(0);
  });

  it("passes the client IP to the store and returns 429 when it's over the limit", async () => {
    let seenIp: string | undefined;
    save = async (_h, { ip }) => {
      seenIp = ip;
      throw new HandoffRateLimitedError();
    };
    const res = await POST(
      new Request("http://test/api/handoff", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      }),
    );
    expect(res.status).toBe(429);
    expect(seenIp).toBe("203.0.113.7");
  });

  it("returns 503 with a safe message when the database fails", async () => {
    save = async () => {
      throw new Error("connection refused");
    };
    const res = await post(body);
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("connection refused");
  });
});
