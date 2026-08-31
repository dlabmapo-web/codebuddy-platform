/**
 * Why a signed-out form is refusing to submit — or `null` when it is not.
 *
 * The forms had grown several independent reasons to disable one button, and
 * collapsing them lost the only thing the person needed: which one it was.
 * Somebody looking at a dead "Create account" could not tell whether the
 * security check was still running or they had simply never picked an academy.
 *
 * Kept out of the components because the *order* is the decision. A form with
 * two unmet conditions has to name one of them, and naming the wrong one sends
 * the person to fix something that was never the problem.
 */
export type SubmitBlock =
  | 'already_submitted'
  | 'academy_missing'
  | 'captcha_pending';

export function signupSubmitBlock(input: {
  /** The action answered and the form is spent — signup's "check your email". */
  succeeded: boolean;
  academyId: string;
  /** False when the deployment has no site key, which makes the token moot. */
  captchaRequired: boolean;
  captchaToken: string | null;
}): SubmitBlock | null {
  // First, because a finished form is not waiting for anything. Whatever else
  // is unmet, telling somebody who has already signed up to pick an academy
  // would be an instruction to redo work that is done.
  if (input.succeeded) return 'already_submitted';
  // Before the challenge: the academy is the person's own decision and the
  // token arrives on its own, so the one that needs a human is named first.
  if (!input.academyId) return 'academy_missing';
  if (input.captchaRequired && !input.captchaToken) return 'captcha_pending';
  return null;
}

export function loginSubmitBlock(input: {
  captchaRequired: boolean;
  captchaToken: string | null;
}): SubmitBlock | null {
  return input.captchaRequired && !input.captchaToken
    ? 'captcha_pending'
    : null;
}
