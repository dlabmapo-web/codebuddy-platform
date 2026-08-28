'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a signed-out form busy from the click until the next page paints.
 *
 * `useActionState`'s `pending` is not enough on its own, and the gap it leaves
 * is the whole reason this exists. A successful sign-in ends in `redirect()`,
 * which means the action never returns a value: `pending` flips back to false
 * the moment the redirect is thrown, and only *then* does the browser start
 * fetching the destination. For that stretch the button had gone back to
 * saying "Sign in" with the form re-enabled — which reads as though the click
 * did nothing, and is exactly when people click it again.
 *
 * So the busy state is armed on submit and disarmed only by an answer. An
 * answer is a new `state` object carrying a message — a rejected password, a
 * taken username, or signup's "check your email", which is a `success` that
 * still returns rather than redirecting. A redirect produces no new state at
 * all, so the form stays busy until the navigation replaces it.
 *
 * Keyed on `state` identity rather than on the message text: the actions build
 * a fresh object per call, so two identical rejections in a row are still two
 * answers, and the second one still disarms.
 *
 * `answered` is what counts as one. The default reads `message`, which is what
 * `AuthFormState` carries; the two recovery forms return a discriminated union
 * instead and pass their own.
 */
export function useAuthSubmission<State>(
  state: State,
  pending: boolean,
  answered: (state: State) => boolean = isAnswer,
) {
  const [armed, setArmed] = useState(false);
  const initial = useRef(state);

  useEffect(() => {
    // The first run sees the initial state, which is nobody's answer.
    if (state === initial.current) return;
    if (answered(state)) setArmed(false);
    // `answered` is a fresh closure per render and is only ever read here, so
    // depending on it would disarm on every render instead of on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const busy = pending || armed;

  return {
    busy,
    /**
     * Arms the busy state, and reports whether this submission should run.
     *
     * `false` means one is already in flight. The button stays focusable while
     * busy — losing focus mid-submit drops a keyboard reader out of the form —
     * so a second press is possible and has to be refused here instead.
     */
    begin(): boolean {
      if (busy) return false;
      setArmed(true);
      return true;
    },
  };
}

/**
 * What counts as the server having answered, for `AuthFormState`.
 *
 * Anything with something to say. That deliberately includes signup's
 * `{ success: true, message }` — the "check your email" outcome does not
 * navigate, so it is an answer and has to release the button. What it excludes
 * is the shape a redirect leaves behind, which is no new state at all.
 */
export function isAnswer(state: unknown): boolean {
  return Boolean(
    state && typeof state === 'object' && 'message' in state && state.message,
  );
}
