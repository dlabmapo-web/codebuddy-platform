import { describe, expect, it } from 'vitest';

import { isAnswer } from './use-auth-submission';

/**
 * The predicate decides when a submitting form is allowed to settle, and
 * getting it wrong is invisible in the common case and stuck in the rare one:
 * too eager and the button flashes back to "Sign in" mid-redirect, too strict
 * and a rejected password leaves the form locked with no way to retry.
 */
describe('isAnswer', () => {
  it('treats a rejection as an answer, so the form can be retried', () => {
    expect(isAnswer({ message: 'That password is not right.' })).toBe(true);
  });

  it("treats signup's check-your-email as an answer", () => {
    // It reports success and still returns rather than navigating, so the
    // button has to be released for the notice beside it to make sense.
    expect(isAnswer({ success: true, message: 'Confirm your address.' })).toBe(
      true,
    );
  });

  it('does not treat the initial state as an answer', () => {
    expect(isAnswer({})).toBe(false);
  });

  it('does not treat a redirect as an answer', () => {
    // A redirecting action never returns, so the state the form still holds is
    // the one it started with. Reading that as "settled" is the bug this
    // whole hook exists to avoid.
    expect(isAnswer({})).toBe(false);
    expect(isAnswer({ message: '' })).toBe(false);
  });

  it('ignores states that carry no message field at all', () => {
    expect(isAnswer({ success: true })).toBe(false);
    expect(isAnswer(undefined)).toBe(false);
    expect(isAnswer(null)).toBe(false);
  });
});
