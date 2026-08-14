/**
 * Phone normalization.
 *
 * Cove stores one canonical form and formats for display in the client, so a
 * guardian reached from Seoul and a guardian reached from abroad are the same
 * row. The rule is deliberately narrow: a value is normalized only when the
 * country is *established* — either the caller wrote `+`, or the value is an
 * unambiguous Korean national number. Anything else is rejected rather than
 * guessed, because a silently wrong emergency contact is worse than a form
 * error the person can fix while they still remember the number.
 */

/** E.164 allows at most 15 digits including the country code. */
const maxDigits = 15;
const minDigits = 8;

export type PhoneNormalization =
  | { ok: true; value: string }
  | { ok: false; reason: "EMPTY" | "AMBIGUOUS" | "LENGTH" };

/**
 * Korea is the only default country Cove can establish without asking. Every
 * academy on the platform operates here, and a national number beginning `0`
 * has exactly one international reading.
 */
const defaultCountryCode = "82";

export function normalizePhone(raw: string): PhoneNormalization {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "EMPTY" };

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "AMBIGUOUS" };

  if (hasPlus) {
    if (digits.length < minDigits || digits.length > maxDigits) {
      return { ok: false, reason: "LENGTH" };
    }
    return { ok: true, value: `+${digits}` };
  }

  // A leading trunk zero is the national form: drop it and prefix the country.
  if (digits.startsWith("0")) {
    const national = digits.slice(1);
    if (national.length < minDigits - 1 || national.length > maxDigits - 2) {
      return { ok: false, reason: "LENGTH" };
    }
    return { ok: true, value: `+${defaultCountryCode}${national}` };
  }

  // No `+`, no trunk zero: this could be a national number missing its zero,
  // a country code without its plus, or an extension. Cove will not decide.
  return { ok: false, reason: "AMBIGUOUS" };
}

/**
 * Display formatting for the stored canonical value.
 *
 * Korean numbers are grouped the way a Korean reader expects; everything else
 * keeps its E.164 digits, which is unambiguous in every locale and never
 * invents a grouping Cove cannot verify.
 */
export function formatPhoneForDisplay(value: string): string {
  if (!value.startsWith(`+${defaultCountryCode}`)) return value;
  const national = `0${value.slice(defaultCountryCode.length + 1)}`;
  if (/^01\d{8,9}$/.test(national)) {
    const head = national.slice(0, 3);
    const tail = national.slice(3);
    const middle = tail.slice(0, tail.length - 4);
    const last = tail.slice(-4);
    return `${head}-${middle}-${last}`;
  }
  if (/^02\d{7,8}$/.test(national)) {
    const tail = national.slice(2);
    return `02-${tail.slice(0, tail.length - 4)}-${tail.slice(-4)}`;
  }
  return national;
}
