import { logoutAction } from '@/app/(auth)/actions';

/**
 * Sign out and land on the login form, once.
 *
 * Separate from `isSessionEnded` because the two are different kinds of thing:
 * one is a question about an error, the other reaches for a server action and
 * the app's configuration through it. Keeping the predicate free of that is
 * what lets it be tested as the pure function it is.
 *
 * `ending` is never cleared. A page in flight usually has several requests
 * running, and a lapsed session fails all of them within the same tick;
 * without the flag the reader gets a handful of concurrent sign-outs racing to
 * redirect. The document is being replaced, so there is nothing to reset it
 * for.
 */
let ending = false;

export async function endSession(): Promise<void> {
  if (ending) return;
  ending = true;
  try {
    await logoutAction();
  } catch {
    // A server action that cannot be reached must not leave the reader on a
    // page whose every request is failing. The redirect is what matters, and
    // the session is refused server-side regardless of what the browser holds.
    window.location.assign('/login');
  }
}
