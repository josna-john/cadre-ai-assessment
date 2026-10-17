"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { INVALID_PHONE } from "@/lib/handoff";
import {
  DEFAULT_COUNTRY,
  countryOptions,
  dialCode,
  digitsOf,
  formatDigits,
  formatInternational,
  isTooLong,
  parsePhone,
  type CountryCode,
} from "@/lib/phone";

export type PhoneValue = { value: string; error?: string };

// The caret position just after the n-th digit of a formatted number. Starts
// after a leading "+": with no digits yet, position 0 would put the next digit
// in front of it.
function caretAfterDigits(value: string, n: number): number {
  let pos = value.startsWith("+") ? 1 : 0;
  for (let seen = 0; pos < value.length && seen < n; pos++) if (/\d/.test(value[pos])) seen++;
  return pos;
}

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
        : { value: parsed?.e164 ?? `${dialCode(c)}${digitsOf(text)}`, error: INVALID_PHONE },
    );
  };

  // Formatting as you type rewrites the value, which would throw the caret to
  // the end. Remember how many digits sat before the caret, and put it back
  // after that many digits once the formatted value has rendered.
  const inputRef = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    const n = caretDigits.current;
    caretDigits.current = null;
    if (n === null || !el || document.activeElement !== el) return;
    const pos = caretAfterDigits(national, n);
    el.setSelectionRange(pos, pos);
  }, [national]);

  const changeNumber = (el: HTMLInputElement) => {
    const text = el.value;
    let digits = digitsOf(text);
    let before = digitsOf(text.slice(0, el.selectionStart ?? text.length)).length;
    // Backspace over a bracket, space or dash leaves the digits unchanged, so
    // the formatter would put it straight back. Delete the digit before it.
    if (text.length < national.length && digits === digitsOf(national) && before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before);
      before -= 1;
    }
    // Stop at the digit limit. Length alone isn't enough: India allows some
    // 13-digit numbers, but a 10-digit mobile is complete. So a typed digit is
    // ignored (wherever the caret is) if it goes past the country's longest
    // number, or turns a complete, valid number into an invalid one. Germany's
    // genuinely longer numbers stay valid and are allowed. A paste is cut to
    // its longest valid prefix.
    const international = text.trimStart().startsWith("+");
    const prev = digitsOf(national);
    const valid = (d: string) => !!parsePhone(international ? `+${d}` : d, country)?.valid;
    const tooLong = (d: string) => isTooLong(d, country, international);
    if (digits.length === prev.length + 1) {
      if (tooLong(digits) || (valid(prev) && !valid(digits))) {
        digits = prev;
        before = Math.max(0, before - 1);
      }
    } else if (digits.length > prev.length && !valid(digits)) {
      while (digits && tooLong(digits)) digits = digits.slice(0, -1);
      for (let n = digits.length - 1; n > 0; n--) {
        if (valid(digits.slice(0, n))) {
          digits = digits.slice(0, n);
          break;
        }
      }
    }
    // Backstop: E.164 caps a number at 15 digits including the country code
    // ("+49" leaves 13 for the German number itself).
    digits = digits.slice(0, international ? 15 : 15 - digitsOf(dialCode(country)).length);

    let c = country;
    let formatted: string;
    if (international) {
      // Typed or pasted with its own country code. Once it's a complete,
      // valid number, switch the picker and show the national part.
      const parsed = parsePhone(`+${digits}`, country);
      if (parsed?.valid && parsed.country) {
        c = parsed.country;
        formatted = parsed.display;
        before = Math.max(0, before - digitsOf(dialCode(c)).length);
      } else {
        formatted = formatInternational(`+${digits}`);
      }
    } else {
      formatted = formatDigits(digits, c);
    }

    if (formatted === national) {
      // Only a rejected character (a letter, say) was typed. The value doesn't
      // change, so nothing re-renders, and React's reset of the controlled
      // input would leave the caret at the end. Put it back after that reset.
      const pos = caretAfterDigits(formatted, before);
      requestAnimationFrame(() => el.setSelectionRange(pos, pos));
      return;
    }
    caretDigits.current = before;
    if (c !== country) setCountry(c);
    setNational(formatted);
    report(formatted, c);
  };

  const changeCountry = (c: CountryCode) => {
    // Digits typed for a country with longer numbers are trimmed to fit.
    let digits = digitsOf(national);
    while (digits && isTooLong(digits, c, false)) digits = digits.slice(0, -1);
    const formatted = national.trimStart().startsWith("+") ? national : formatDigits(digits, c);
    setCountry(c);
    setNational(formatted);
    report(formatted, c);
  };

  return (
    <div className="flex">
      <div className="relative flex shrink-0 items-center gap-1.5 rounded-l-xl border border-r-0 border-hairline bg-white pr-2 pl-3 focus-within:ring-4 focus-within:ring-cadre-red/15">
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
        ref={inputRef}
        onChange={(e) => changeNumber(e.currentTarget)}
        onBlur={onBlur}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="min-h-11 w-full min-w-0 rounded-r-xl border border-hairline bg-white px-3 py-2 text-base text-ink transition-shadow focus:border-cadre-red/55 focus:ring-4 focus:ring-cadre-red/15 focus:outline-none aria-[invalid=true]:border-red-600 sm:text-sm"
      />
    </div>
  );
}
