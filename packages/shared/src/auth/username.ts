import { z } from "zod";

/**
 * Reserved because they read as platform-owned identities. Sign-in resolves a
 * username to an account, so a student holding `admin` would carry that
 * apparent authority through every roster, mention, and support conversation.
 */
const reservedUsernames = new Set([
  "admin",
  "administrator",
  "root",
  "support",
  "cove",
  "system",
  "api",
  "auth",
  "me",
  "null",
]);

/**
 * 5-30 characters, never starting or ending with a separator.
 *
 * Deliberately narrow. An elementary student types this from memory on a
 * classroom keyboard and reads it back to a teacher out loud, so the form
 * stored is the single lowercase form — there is no second casing of a name
 * that could sign somebody in.
 */
const usernamePattern = /^[a-z0-9][a-z0-9_.-]{3,28}[a-z0-9]$/;

export const usernameMinLength = 5;
export const usernameMaxLength = 30;

export const usernameSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => usernamePattern.test(value), {
    message:
      "must be 5-30 characters using letters, digits, dot, dash, or underscore",
  })
  .refine((value) => !reservedUsernames.has(value), { message: "is reserved" });

export type Username = z.infer<typeof usernameSchema>;

/**
 * Normalizes without asserting. Used where a username arrives from a source
 * that may legitimately hold nothing usable — an OAuth account's user
 * metadata, or a sign-in field the person has not filled in yet.
 */
export function parseUsername(value: unknown): string | null {
  const result = usernameSchema.safeParse(value);
  return result.success ? result.data : null;
}
