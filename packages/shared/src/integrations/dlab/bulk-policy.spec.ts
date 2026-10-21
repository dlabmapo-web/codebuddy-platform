import { expect, it } from 'vitest';
import { bulkEligibility } from '../../memberships/people-bulk.js';
it('records local restrictions independently of OS restrictions', () => {
  const managed = { role: 'TEACHER', status: 'SUSPENDED', dlabManaged: true, sourceBlocked: true, localSuspended: false };
  expect(bulkEligibility(managed, { kind: 'SUSPEND' })).toEqual({ eligible: true, code: 'ok' });
  expect(bulkEligibility(managed, { kind: 'RESTORE' })).toEqual({ eligible: false, code: 'source_blocked' });
  expect(bulkEligibility({ ...managed, localSuspended: true }, { kind: 'RESTORE' })).toEqual({ eligible: true, code: 'ok' });
  expect(bulkEligibility({ ...managed, status: 'ACTIVE' }, { kind: 'ROLE_CHANGE', role: 'MANAGER' })).toEqual({ eligible: false, code: 'managed_by_os' });
});
