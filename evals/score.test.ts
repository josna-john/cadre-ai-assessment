import { describe, expect, it } from "vitest";
import { score } from "./score";

describe("score", () => {
  it("passes when required substrings are present, case-insensitively", () => {
    expect(score({ id: "a", input: "", mustInclude: ["Cadre"] }, "hello CADRE")).toBe(true);
  });

  it("fails when a required substring is missing", () => {
    expect(score({ id: "b", input: "", mustInclude: ["cadre"] }, "hello")).toBe(false);
  });

  it("fails when an excluded substring is present", () => {
    expect(score({ id: "c", input: "", mustExclude: ["error"] }, "an Error occurred")).toBe(false);
  });
});
