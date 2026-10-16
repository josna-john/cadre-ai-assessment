import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js/max";

// Phone numbers, checked against each country's real numbering rules.
// `max` metadata, because the default `min` set only checks length and would
// accept "+1 123 456 7890". It's ~145 KB, so only two places import this: the
// lazily loaded PhoneField and the handoff route. Keep it out of shared modules
// such as handoff.ts, which ship in the main chat bundle.

export type { CountryCode };

// Cadre's contact form defaults to the US.
export const DEFAULT_COUNTRY: CountryCode = "US";

export function dialCode(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

// Every country the metadata knows, by English name, for the picker.
export function countryOptions(): { code: CountryCode; name: string; dial: string }[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, dial: dialCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// What the visitor typed in the selected country. A pasted international
// number ("+44 20…") wins over the picker, and its country is returned so the
// picker can follow.
export function parsePhone(input: string, country: CountryCode) {
  const parsed = parsePhoneNumberFromString(input, country);
  return parsed
    ? {
        e164: parsed.number,
        country: parsed.country,
        valid: parsed.isValid(),
        display: formatDigits(parsed.nationalNumber, parsed.country ?? country),
      }
    : undefined;
}

export const digitsOf = (s: string) => s.replace(/\D/g, "");

// Format the digits typed so far in the country's style, for the box beside
// the dial code: "(619) 555-0100" in the US, "98765 43210" in India. Some
// countries (UK, Germany) only format nationally when the number starts with
// the trunk "0"; without it the national formatter returns bare digits, so
// fall back to international grouping minus the "+44" ("20 7946 0958").
export function formatDigits(digits: string, country: CountryCode): string {
  if (!digits) return "";
  const national = new AsYouType(country).input(digits);
  if (/\D/.test(national) || digits.length <= 3) return national;
  return new AsYouType().input(`${dialCode(country)}${digits}`).replace(/^\+\d+\s*/, "");
}

// Whether these digits are already past the longest number the country allows
// (including its trunk prefix, e.g. a leading 0 in the UK or 1 in the US). With
// `international`, the digits start with their own calling code.
export function isTooLong(digits: string, country: CountryCode, international: boolean): boolean {
  return (
    validatePhoneNumberLength(international ? `+${digits}` : digits, international ? undefined : country) ===
    "TOO_LONG"
  );
}

// A number typed with its own "+" code: formatted internationally as typed.
export function formatInternational(text: string): string {
  return new AsYouType().input(text);
}

// Server-side check on the E.164 value the form submits.
export function isValidPhone(e164: string): boolean {
  return isValidPhoneNumber(e164);
}
