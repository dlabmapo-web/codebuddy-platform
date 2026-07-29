import { describe, expect, it } from 'vitest';
import {
  shouldReconcileSubmission,
  SUBMISSION_RECONCILIATION_DELAY_MS,
} from './reconciliationPolicy';

describe('submission reconciliation policy', () => {
  it('does not reconcile before the three-second fallback threshold', () => {
    expect(shouldReconcileSubmission({
      elapsedMs: SUBMISSION_RECONCILIATION_DELAY_MS - 1,
      attempted: false,
    })).toBe(false);
  });

  it('allows one fallback reconciliation at the threshold', () => {
    expect(shouldReconcileSubmission({
      elapsedMs: SUBMISSION_RECONCILIATION_DELAY_MS,
      attempted: false,
    })).toBe(true);
  });

  it('does not reconcile again after the fallback was attempted', () => {
    expect(shouldReconcileSubmission({
      elapsedMs: SUBMISSION_RECONCILIATION_DELAY_MS + 10_000,
      attempted: true,
    })).toBe(false);
  });
});
