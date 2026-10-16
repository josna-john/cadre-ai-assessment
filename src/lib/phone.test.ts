import { describe, expect, it } from "vitest";
import { countryOptions, dialCode, isValidPhone, parsePhone } from "./phone";

describe("phone", () => {
  it("checks digits against the country's rules, not just length", () => {
    expect(parsePhone("(619) 324-3223", "US")).toMatchObject({ e164: "+16193243223", valid: true });
    // Right length, but US area codes can't start with 1. The default `min`
    // metadata would accept this one.
    expect(parsePhone("123 456 7890", "US")?.valid).toBe(false);
    expect(parsePhone("12345", "US")?.valid).toBe(false);
  });

  it("lets a pasted international number override the selected country", () => {
    expect(parsePhone("+44 20 7946 0958", "US")).toMatchObject({ country: "GB", e164: "+442079460958", valid: true });
  });

  it("validates the E.164 value the server receives", () => {
    expect(isValidPhone("+919876543210")).toBe(true);
    expect(isValidPhone("+11234567890")).toBe(false);
  });

  it("lists every country by name with its dial code, US included", () => {
    const options = countryOptions();
    expect(options.length).toBeGreaterThan(200);
    expect(options).toContainEqual({ code: "US", name: "United States", dial: "+1" });
    expect(dialCode("GB")).toBe("+44");
  });
});
