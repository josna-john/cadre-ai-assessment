import { describe, expect, it } from "vitest";
import { countryOptions, dialCode, formatDigits, isTooLong, isValidPhone, parsePhone } from "./phone";

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

  it("formats digits as typed in the country's style", () => {
    expect(formatDigits("619", "US")).toBe("(619)");
    expect(formatDigits("6195", "US")).toBe("(619) 5");
    expect(formatDigits("6195550100", "US")).toBe("(619) 555-0100");
    expect(formatDigits("9876543210", "IN")).toBe("98765 43210");
    // UK/Germany only format nationally with the trunk 0; without it, fall
    // back to international grouping rather than a run of bare digits.
    expect(formatDigits("02079460958", "GB")).toBe("020 7946 0958");
    expect(formatDigits("2079460958", "GB")).toBe("20 7946 0958");
    expect(formatDigits("", "US")).toBe("");
  });

  it("displays a saved E.164 number the same way it would be typed", () => {
    expect(parsePhone("+16195550100", "US")?.display).toBe("(619) 555-0100");
    expect(parsePhone("+442079460958", "US")?.display).toBe("20 7946 0958");
  });

  it("knows each country's longest number, trunk prefixes included", () => {
    expect(isTooLong("6193243223", "US", false)).toBe(false);
    expect(isTooLong("61932432231", "US", false)).toBe(true);
    expect(isTooLong("16193243223", "US", false)).toBe(false); // leading 1
    expect(isTooLong("02079460958", "GB", false)).toBe(false); // leading 0
    expect(isTooLong("20794609581", "GB", false)).toBe(true);
    expect(isTooLong("4420794609581", "US", true)).toBe(true); // "+44…": its own country's limit
  });

  it("lists every country by name with its dial code, US included", () => {
    const options = countryOptions();
    expect(options.length).toBeGreaterThan(200);
    expect(options).toContainEqual({ code: "US", name: "United States", dial: "+1" });
    expect(dialCode("GB")).toBe("+44");
  });
});
