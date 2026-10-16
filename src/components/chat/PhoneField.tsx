"use client";

import { useMemo, useState } from "react";
import { INVALID_PHONE } from "@/lib/handoff";
import { DEFAULT_COUNTRY, countryOptions, dialCode, parsePhone, type CountryCode } from "@/lib/phone";

export type PhoneValue = { value: string; error?: string };

// Country picker plus number, like cadre.ai/contact. Loaded lazily by
// HandoffForm, so the ~145 KB of numbering rules (src/lib/phone.ts) only
// download for visitors who reach the form.
//
// The visible flag and dial code are drawn under a transparent native
// <select>, which keeps keyboard, screen-reader and mobile pickers working
// while looking like Cadre's flag dropdown.
export default function PhoneField({
  id,
  initial,
  invalid,
  describedBy,
  onChange,
  onBlur,
}: {
  id: string;
  // A number sent earlier in this chat (E.164), to prefill.
  initial?: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (phone: PhoneValue) => void;
  onBlur: () => void;
}) {
  const countries = useMemo(() => countryOptions(), []);
  const [start] = useState(() => (initial ? parsePhone(initial, DEFAULT_COUNTRY) : undefined));
  const [country, setCountry] = useState<CountryCode>(start?.country ?? DEFAULT_COUNTRY);
  const [national, setNational] = useState(start?.display ?? "");

  // Report the submittable value (E.164 when valid) and any error up to the form.
  const report = (text: string, c: CountryCode) => {
    if (!text.trim()) return onChange({ value: "" });
    const parsed = parsePhone(text, c);
    onChange(
      parsed?.valid
        ? { value: parsed.e164 }
        : { value: parsed?.e164 ?? `${dialCode(c)}${text.replace(/\D/g, "")}`, error: INVALID_PHONE },
    );
  };

  const changeNumber = (text: string) => {
    setNational(text);
    // A pasted international number picks its own country.
    const parsed = text.trim().startsWith("+") ? parsePhone(text, country) : undefined;
    const c = parsed?.country ?? country;
    if (c !== country) setCountry(c);
    report(text, c);
  };

  const changeCountry = (c: CountryCode) => {
    setCountry(c);
    report(national, c);
  };

  // Tidy the number into the country's usual format once they're done typing.
  // Not while typing: reformatting under the cursor fights backspace.
  const blur = () => {
    const parsed = national.trim() ? parsePhone(national, country) : undefined;
    if (parsed?.valid) setNational(parsed.display);
    onBlur();
  };

  return (
    <div className="flex">
      <div className="relative flex shrink-0 items-center gap-1.5 rounded-l-xl border border-r-0 border-hairline bg-white pr-2 pl-3 focus-within:ring-2 focus-within:ring-cadre-blue/20">
        {/* eslint-disable-next-line @next/next/no-img-element -- 1 KB static SVG, nothing for next/image to optimize */}
        <img src={`/flags/${country}.svg`} alt="" width={18} height={12} className="h-3 w-[18px] rounded-[2px] object-cover" />
        <span className="text-sm text-ink-800 tabular-nums">{dialCode(country)}</span>
        <svg viewBox="0 0 8 5" aria-hidden="true" className="w-2 fill-ink-600">
          <path d="M0 0h8L4 5z" />
        </svg>
        <select
          aria-label="Country code"
          value={country}
          onChange={(e) => changeCountry(e.target.value as CountryCode)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.dial})
            </option>
          ))}
        </select>
      </div>
      <input
        id={id}
        type="tel"
        autoComplete="tel-national"
        inputMode="tel"
        maxLength={25}
        value={national}
        onChange={(e) => changeNumber(e.target.value)}
        onBlur={blur}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="w-full min-w-0 rounded-r-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-cadre-blue/50 focus:ring-2 focus:ring-cadre-blue/20 focus:outline-none aria-[invalid=true]:border-red-500"
      />
    </div>
  );
}
