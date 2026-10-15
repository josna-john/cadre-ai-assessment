import { describe, expect, it } from "vitest";
import { TIMEOUT_ERROR } from "@/lib/chat-stream";
import { friendlyErrorMessage } from "./errors";

const httpError = (status: number, body: string) =>
  Object.assign(new Error(body), { statusCode: status, responseBody: body });

describe("friendlyErrorMessage", () => {
  it("shows our route's JSON message", () => {
    const body = JSON.stringify({ error: "input_too_long", message: "Please keep messages under 1000 characters." });
    expect(friendlyErrorMessage(httpError(400, body))).toBe("Please keep messages under 1000 characters.");
  });

  it("explains a firewall 429, which has no JSON body", () => {
    expect(friendlyErrorMessage(httpError(429, "Too Many Requests"))).toMatch(/wait a minute/);
  });

  it("shows the timeout message sent as a stream error chunk", () => {
    expect(friendlyErrorMessage(new Error(JSON.stringify(TIMEOUT_ERROR)))).toBe(TIMEOUT_ERROR.message);
  });

  it("never leaks raw server text", () => {
    expect(friendlyErrorMessage(httpError(500, "TypeError: cannot read x at /var/task/route.js"))).toBe(
      "Something went wrong while getting a reply.",
    );
  });
});
