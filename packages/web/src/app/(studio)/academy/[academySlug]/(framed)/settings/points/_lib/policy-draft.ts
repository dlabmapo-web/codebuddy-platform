import type { PointPolicy } from '@cove/shared';

/**
 * The editor's draft: every value as typed.
 *
 * Strings rather than numbers, because a manager clearing a box to retype it
 * is a state the form has to be able to hold. Holding numbers would mean
 * turning that empty box into a `0` — a policy nobody asked for, and one that
 * would validate.
 */
export type PolicyDraft = Record<PolicyField, string>;
export type PolicyField = keyof PointPolicy;

export const toDraft = (policy: PointPolicy): PolicyDraft =>
  Object.fromEntries(
    Object.entries(policy).map(([field, value]) => [field, String(value)]),
  ) as PolicyDraft;

/**
 * A draft as a policy, or null while it is not one.
 *
 * An empty box is not zero and a half-typed `-` is not a number, so an
 * unparseable draft yields no policy at all. The caller shows the field its
 * own message and holds the preview on the last good values rather than
 * flickering to a board where everything pays nothing.
 */
export function toPolicy(draft: PolicyDraft): PointPolicy | null {
  const entries = Object.entries(draft).map(([field, value]) => [
    field,
    value.trim() === '' ? Number.NaN : Number(value),
  ]);
  if (entries.some(([, value]) => !Number.isFinite(value as number))) return null;
  return Object.fromEntries(entries) as PointPolicy;
}

/** Which boxes are not a number yet, in the draft's own order. */
export function unparseableFields(draft: PolicyDraft): PolicyField[] {
  return (Object.keys(draft) as PolicyField[]).filter((field) => {
    const value = draft[field];
    return value.trim() === '' || !Number.isFinite(Number(value));
  });
}

/** Whether the draft differs from the values it was loaded with. */
export function isDirty(draft: PolicyDraft, saved: PointPolicy): boolean {
  return (Object.keys(draft) as PolicyField[]).some(
    (field) => draft[field] !== String(saved[field]),
  );
}

/** Whether two policies hold the same seventeen values. */
export function samePolicy(first: PointPolicy, second: PointPolicy): boolean {
  return (Object.keys(first) as PolicyField[]).every(
    (field) => first[field] === second[field],
  );
}

/**
 * The copy key for one rejection.
 *
 * The cross-field rules carry their own name as the message — `SOLVE_ORDER`,
 * `LATE_ORDER` — because what a manager should read is about the pair, not
 * about the box they are standing in. Everything else is a bound, and a bound
 * has three outcomes worth distinguishing and no more.
 */
export const policyErrorCopy = {
  SOLVE_ORDER: 'policy.error.SOLVE_ORDER',
  TIER_MINUTES_ORDER: 'policy.error.TIER_MINUTES_ORDER',
  TIER_POINTS_ORDER: 'policy.error.TIER_POINTS_ORDER',
  LATE_ORDER: 'policy.error.LATE_ORDER',
  REQUIRED: 'policy.error.REQUIRED',
  TOO_SMALL: 'policy.error.TOO_SMALL',
  TOO_BIG: 'policy.error.TOO_BIG',
  INVALID: 'policy.error.INVALID',
} as const;
export type PolicyErrorKey = keyof typeof policyErrorCopy;

export function policyErrorKey(issue: {
  code: string;
  message: string;
}): PolicyErrorKey {
  if (issue.message in policyErrorCopy) return issue.message as PolicyErrorKey;
  if (issue.code === 'too_small') return 'TOO_SMALL';
  if (issue.code === 'too_big') return 'TOO_BIG';
  return 'INVALID';
}
