/**
 * The alphabet a manager-issued student password is drawn from.
 *
 * `i`, `l`, `o`, `0`, and `1` are absent on purpose. A seven-year-old types
 * this from a slip of paper a teacher wrote out, and a password that cannot be
 * read back unambiguously is a support call rather than a credential.
 */
export const issuedPasswordAlphabet = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Ten characters from 31 symbols — about 49 bits.
 *
 * Sized against the visible prefix below rather than against the whole string.
 * The manager's screen shows the first three characters unmasked so a
 * credential can be recognised without being revealed, which leaves seven
 * characters and roughly 34 bits behind the mask — ample against an online
 * endpoint that Supabase rate-limits, which is the only way this password can
 * ever be tried.
 */
export const issuedPasswordLength = 10;

/** How much of an issued password the manager's screen shows unmasked. */
export const issuedPasswordVisiblePrefix = 3;

/**
 * A fresh password for a student who cannot recover one by email.
 *
 * Rejection sampling rather than a modulo of a random byte: 256 is not a
 * multiple of 31, so folding a byte into the alphabet would make the first
 * eight symbols measurably more likely than the rest.
 */
export function generateIssuedPassword(): string {
  const size = issuedPasswordAlphabet.length;
  const limit = Math.floor(256 / size) * size;
  const out: string[] = [];
  const buffer = new Uint8Array(issuedPasswordLength * 2);

  while (out.length < issuedPasswordLength) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= limit) continue;
      out.push(issuedPasswordAlphabet[byte % size]!);
      if (out.length === issuedPasswordLength) break;
    }
  }
  return out.join("");
}

/** The first characters of an issued password, which the manager's screen shows. */
export function issuedPasswordPrefix(password: string): string {
  return password.slice(0, issuedPasswordVisiblePrefix);
}

/**
 * How an issued password reads before anybody asks to see it — `hae•••••••`.
 *
 * Built from the stored prefix and length rather than from the password, so
 * rendering the manager's list never requires decrypting anything.
 */
export function maskIssuedPassword(prefix: string, length: number): string {
  const hidden = Math.max(0, length - prefix.length);
  return `${prefix}${"•".repeat(hidden)}`;
}
