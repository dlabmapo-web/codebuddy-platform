import { toApiError } from '@/lib/api-errors';

/**
 * The answers that mean "this session is over", as opposed to "you may not do
 * that".
 *
 * A short, explicit list rather than "any 401". `PROFILE_INCOMPLETE` and
 * `USER_SUSPENDED` are also refusals of the whole account, and both have
 * screens of their own that explain what to do — signing those people out
 * would replace an explanation with a login form.
 */
const endedCodes = new Set([
  'AUTHENTICATION_REQUIRED',
  'TOKEN_INVALID',
  'STUDENT_SESSION_EXPIRED',
]);

/**
 * Whether an error means the session has ended and the reader has to sign in
 * again.
 *
 * `STUDENT_SESSION_UNAVAILABLE` is deliberately excluded. It means Redis is
 * down, not that anybody's session lapsed, and signing a whole academy out
 * because a cache is unreachable turns a degraded feature into an outage.
 */
export function isSessionEnded(error: unknown): boolean {
  const { code, status } = toApiError(error);
  if (!code) return false;
  return status === 401 && endedCodes.has(code);
}
