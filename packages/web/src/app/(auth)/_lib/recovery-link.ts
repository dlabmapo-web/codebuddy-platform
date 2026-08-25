/**
 * What a Supabase recovery email is allowed to put in the confirmation URL.
 *
 * Exactly two parameters, and nothing is read from the rest. A recovery email
 * is the one message Cove sends that a stranger can cause to be delivered to
 * somebody else's inbox, so any destination it could carry — `next`,
 * `redirect_to`, `returnTo` — would be an open redirect wearing Cove's
 * sender address.
 */
export type RecoveryLink = { tokenHash: string };

export function readRecoveryLink(
  query: Record<string, string | string[] | undefined>,
): RecoveryLink | null {
  const tokenHash = single(query.token_hash)?.trim();
  // `type` is pinned rather than passed through: a `signup` or `email_change`
  // hash verified here would mint a recovery capability from a link that was
  // never a password reset.
  if (!tokenHash || single(query.type) !== 'recovery') return null;
  return { tokenHash };
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
