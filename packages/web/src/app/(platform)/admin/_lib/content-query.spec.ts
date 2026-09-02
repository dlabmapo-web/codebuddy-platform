import { describe, expect, it } from 'vitest';

import {
  contentPath,
  parseContentQuery,
  queryForContentLens,
  serializeContentQuery,
} from './content-query';

const academyId = '20000000-0000-4000-8000-000000000001';

describe('content query', () => {
  it('round-trips academy filters and paging', () => {
    const query = parseContentQuery(`academy=${academyId}&q=python&page=3`);
    expect(serializeContentQuery(query)).toBe(
      `q=python&academy=${academyId}&page=3`,
    );
  });

  it('keeps academy scope but clears search, sort and page for a lens switch', () => {
    const query = parseContentQuery(
      `academy=${academyId}&q=python&page=3&sort=modules&dir=asc`,
    );
    expect(contentPath('problems', queryForContentLens(query))).toBe(
      `/admin/content/problems?academy=${academyId}`,
    );
  });

  it('round-trips a sort', () => {
    const query = parseContentQuery('sort=students&dir=asc');
    expect(query.sort).toBe('students');
    expect(query.direction).toBe('asc');
    expect(serializeContentQuery(query)).toBe('sort=students&dir=asc');
  });

  it('leaves newest-first out of the address', () => {
    // The default has to serialize to nothing, or the server-rendered
    // `initialKey` never matches the client's and the first paint refetches.
    expect(serializeContentQuery(parseContentQuery(''))).toBe('');
    expect(serializeContentQuery(parseContentQuery('sort=updatedAt&dir=desc')))
      .toBe('');
  });

  it('falls back on a sort key the contract does not allow', () => {
    // The value reaches an `orderBy`. A bookmark, a chat message and a hand-
    // edited address all arrive here, so an unknown key is a page rather than
    // an error — and never a column name forwarded to the API.
    const query = parseContentQuery('sort=DROP+TABLE&dir=sideways');
    expect(query.sort).toBe('updatedAt');
    expect(query.direction).toBe('desc');
  });
});
