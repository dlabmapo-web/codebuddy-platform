import { describe, expect, it } from 'vitest';
import { helpWaitSeconds, listHelpRequestsInputSchema, requestHelpInputSchema } from './help-requests.js';

describe('help request contracts', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  it('bounds queue pages and requires explicit class/material context', () => {
    expect(listHelpRequestsInputSchema.parse({ academyId: id, classId: id, status: 'WAITING' }).limit).toBe(50);
    expect(listHelpRequestsInputSchema.safeParse({ academyId: id, classId: id, status: 'WAITING', limit: 101 }).success).toBe(false);
    expect(requestHelpInputSchema.safeParse({ academyId: id, materialId: id, idempotencyKey: id }).success).toBe(false);
  });
  it('freezes wait at the current claim and resumes original age after return', () => {
    const requestedAt = '2026-09-18T00:00:00.000Z';
    const claimedAt = '2026-09-18T00:01:00.000Z';
    const now = Date.parse('2026-09-18T00:03:00.000Z');
    expect(helpWaitSeconds({ requestedAt, claimedAt, status: 'IN_PROGRESS' }, now)).toBe(60);
    expect(helpWaitSeconds({ requestedAt, claimedAt: null, status: 'WAITING' }, now)).toBe(180);
    expect(helpWaitSeconds({ requestedAt, claimedAt: null, status: 'WAITING' }, 0)).toBe(0);
  });
});
