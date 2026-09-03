/**
 * The domain Cove gives an account that has no email address of its own.
 *
 * Elementary students sign up without one, and Supabase Auth requires an
 * address for every identity. The account therefore gets a generated address
 * in a domain reserved by RFC 2606, which resolves nowhere: a message sent
 * there cannot arrive and cannot be misdelivered to a real inbox.
 *
 * Deliberately a *different* reserved domain from the `unresolved.invalid`
 * that `resolveSignInEmail` returns for a username nobody holds. Sharing one
 * would make "this account has no email" and "this account does not exist" the
 * same string, and the second is the enumeration answer that resolver exists
 * to withhold.
 */
export const placeholderEmailDomain = "no-email.cove.invalid";

/**
 * Builds the placeholder address for an account, from an identifier the caller
 * has already generated.
 *
 * Takes an id rather than a username. An address derived from the username
 * would publish that name into Supabase's auth table and into every provider
 * log that touches it, and would tie a later rename to an identity change.
 */
export function buildPlaceholderEmail(id: string): string {
  return `s-${id.toLowerCase()}@${placeholderEmailDomain}`;
}

/**
 * Whether this address is one Cove generated because the account has none.
 *
 * The single question every display, export, invitation match, and recovery
 * decision asks before treating a stored address as something a person can
 * read. Matched on the exact domain rather than a suffix, so a lookalike such
 * as `evil-no-email.cove.invalid` is not mistaken for one of Cove's.
 */
export function isPlaceholderAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  const at = value.lastIndexOf("@");
  return at > 0 && value.slice(at + 1).toLowerCase() === placeholderEmailDomain;
}

/**
 * The address as a person should see it: the real one, or nothing at all.
 *
 * A placeholder must never reach a screen. It is meaningless to the reader and
 * looks like corrupted data, so every surface that shows an address routes
 * through this rather than deciding for itself.
 */
export function displayableEmail(
  email: string | null | undefined,
): string | null {
  return !email || isPlaceholderAddress(email) ? null : email;
}
