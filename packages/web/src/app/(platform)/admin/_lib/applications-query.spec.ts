import { describe, expect, it } from 'vitest';

import {
  applicationsPath,
  parseApplicationsQuery,
  serializeApplicationsQuery,
} from './applications-query';

const academyId = '20000000-0000-4000-8000-000000000001';

describe('applications query', () => {
  it('round-trips every narrowing the toolbar offers', () => {
    const query = parseApplicationsQuery(
      `q=jin&academy=${academyId}&status=APPROVED&needs=1&page=2`,
    );
    expect(serializeApplicationsQuery(query)).toBe(
      `q=jin&academy=${academyId}&status=APPROVED&needs=1&page=2`,
    );
  });

  it('leaves the default view out of the address', () => {
    // The defaults have to serialize to nothing, or the server-rendered
    // `initialKey` never matches the client's and the first paint refetches
    // the page it was just handed.
    expect(serializeApplicationsQuery(parseApplicationsQuery(''))).toBe('');
    expect(applicationsPath(parseApplicationsQuery(''))).toBe(
      '/admin/applications',
    );
  });

  it('falls back on values the contract does not allow', () => {
    // `sort` reaches an `orderBy`, and a bookmark or a hand-edited address is
    // the ordinary way an unknown one arrives.
    const query = parseApplicationsQuery(
      'sort=DROP+TABLE&dir=sideways&status=NONSENSE&academy=not-a-uuid',
    );
    expect(query.sort).toBe('waiting');
    expect(query.direction).toBe('asc');
    expect(query.statuses).toEqual([]);
    expect(query.academyIds).toEqual([]);
  });

  it('reads the needs-you filter as a flag, not a string', () => {
    expect(parseApplicationsQuery('needs=1').leaderlessOnly).toBe(true);
    expect(parseApplicationsQuery('needs=0').leaderlessOnly).toBeUndefined();
  });
});
