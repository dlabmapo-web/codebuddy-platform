import { z } from "zod";

import { normalizePhone } from "./phone.js";

/**
 * The shapes every human-entered profile field is built from.
 *
 * Two rules, applied once here rather than repeated on thirty fields: text is
 * trimmed, and control characters are refused. A name carrying a stray newline
 * or a right-to-left override renders differently in a roster, an audit log,
 * and a CSV export, and none of those differences are ones a manager can see
 * before they matter.
 */
const controlCharacters =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\uFEFF]/;

export function safeText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((value) => !controlCharacters.test(value), {
      message: "must not contain control characters",
    });
}

/**
 * An optional field. The browser sends `""` for a cleared input and `null` for
 * one that was never filled; both mean the same thing to the database, so they
 * are collapsed here instead of in every service.
 */
export function optionalText(max: number) {
  return safeText(max)
    .nullable()
    .transform((value) => (value ? value : null));
}

/**
 * An optional phone number, canonicalized on the way in.
 *
 * The rejection is deliberate: `normalizePhone` refuses values whose country
 * it cannot establish, and this surfaces that as a field error rather than
 * storing a number nobody can dial.
 */
export const optionalPhone = z
  .string()
  .trim()
  .max(32)
  .nullable()
  .transform((value, ctx) => {
    if (!value) return null;
    const result = normalizePhone(value);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        message: "must be a phone number Cove can dial internationally",
      });
      return z.NEVER;
    }
    return result.value;
  });

/** The earliest birth date Cove treats as a typo rather than a person. */
const earliestBirthYear = 1900;

/**
 * A birth date, or nothing. Bounded on both ends: a future date is always an
 * error, and a date before 1900 is a mis-keyed year rather than a student.
 */
export const optionalBirthDate = z
  // `""` is what a cleared `<input type="date">` sends, and it means the same
  // thing as null. Accepted as its own branch so the date format check never
  // sees it and turns "I removed this" into a validation error.
  .union([z.literal(""), z.null(), z.iso.date()])
  .transform((value) => value || null)
  .refine(
    (value) => {
      if (!value) return true;
      const year = Number(value.slice(0, 4));
      if (year < earliestBirthYear) return false;
      // Compared as dates, not timestamps: a birthday is a calendar fact and
      // must not depend on which side of midnight UTC the server is on.
      return value <= new Date().toISOString().slice(0, 10);
    },
    { message: "must be a past date after 1900" },
  );
