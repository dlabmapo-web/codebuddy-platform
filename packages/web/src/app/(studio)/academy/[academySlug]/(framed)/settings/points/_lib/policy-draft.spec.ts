import { DEFAULT_POINT_POLICY, pointPolicySchema } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  isDirty,
  policyErrorKey,
  samePolicy,
  toDraft,
  toPolicy,
  unparseableFields,
} from './policy-draft';

const draft = toDraft(DEFAULT_POINT_POLICY);

describe('toPolicy', () => {
  it('round-trips a policy through the boxes it is typed in', () => {
    expect(toPolicy(draft)).toEqual(DEFAULT_POINT_POLICY);
  });

  it('refuses to read an empty box as a zero', () => {
    // The whole reason the draft holds strings: a manager clearing a field to
    // retype it has not asked for an economy that pays nothing for a solve.
    expect(toPolicy({ ...draft, solveHard: '' })).toBeNull();
    expect(toPolicy({ ...draft, solveHard: '  ' })).toBeNull();
  });

  it('refuses the half-typed values a number field allows', () => {
    for (const value of ['-', '1e', 'abc', '--3']) {
      expect(toPolicy({ ...draft, solveHard: value })).toBeNull();
    }
  });

  it('keeps a legitimate zero', () => {
    // Zero is how a manager switches one reason off, and it must survive the
    // trip that rejects an empty box.
    expect(toPolicy({ ...draft, attendance: '0' })?.attendance).toBe(0);
  });
});

describe('unparseableFields', () => {
  it('names every box that is not a number yet', () => {
    expect(unparseableFields(draft)).toEqual([]);
    expect(
      unparseableFields({ ...draft, solveEasy: '', attendance: '-' }),
    ).toEqual(['solveEasy', 'attendance']);
  });
});

describe('isDirty', () => {
  it('is false for the values it was loaded with', () => {
    expect(isDirty(draft, DEFAULT_POINT_POLICY)).toBe(false);
  });

  it('notices a change, and a rewrite of the same number', () => {
    expect(isDirty({ ...draft, solveHard: '11' }, DEFAULT_POINT_POLICY)).toBe(
      true,
    );
    // `010` is the same number and a different draft. Treating it as dirty
    // costs one harmless save; treating it as clean would disable Save on a
    // field the manager has visibly edited.
    expect(isDirty({ ...draft, solveHard: '010' }, DEFAULT_POINT_POLICY)).toBe(
      true,
    );
  });
});

describe('samePolicy', () => {
  it('compares values rather than identity', () => {
    expect(samePolicy(DEFAULT_POINT_POLICY, { ...DEFAULT_POINT_POLICY })).toBe(
      true,
    );
    expect(
      samePolicy(DEFAULT_POINT_POLICY, {
        ...DEFAULT_POINT_POLICY,
        solveEasy: 4,
      }),
    ).toBe(false);
  });
});

describe('policyErrorKey', () => {
  it('names the rule a cross-field rejection broke', () => {
    const result = pointPolicySchema.safeParse({
      ...DEFAULT_POINT_POLICY,
      solveHard: 1,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(policyErrorKey(result.error.issues[0]!)).toBe('SOLVE_ORDER');
  });

  it('sorts a bound into which side it fell off', () => {
    const small = pointPolicySchema.safeParse({
      ...DEFAULT_POINT_POLICY,
      studentDailyCap: 0,
    });
    const big = pointPolicySchema.safeParse({
      ...DEFAULT_POINT_POLICY,
      moduleCompleted: 5000,
    });

    expect(small.success || big.success).toBe(false);
    if (!small.success) {
      expect(policyErrorKey(small.error.issues[0]!)).toBe('TOO_SMALL');
    }
    if (!big.success) {
      expect(policyErrorKey(big.error.issues[0]!)).toBe('TOO_BIG');
    }
  });
});
