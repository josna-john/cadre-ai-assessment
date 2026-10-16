import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
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
        // For display beside the dial-code box: international spacing minus
        // the "+44", so no national trunk prefix ("+44 | 20 7946 0958", not
        // "+44 | 020 7946 0958").
        display: parsed.formatInternational().replace(/^\+\d+\s*/, ""),
      }
    : undefined;
}

// Server-side check on the E.164 value the form submits.
export function isValidPhone(e164: string): boolean {
  return isValidPhoneNumber(e164);
}
