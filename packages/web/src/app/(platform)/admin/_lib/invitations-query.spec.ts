import { describe, expect, it } from 'vitest';

import {
  invitationsPath,
  parseInvitationsQuery,
  serializeInvitationsQuery,
} from './invitations-query';

const academyId = '20000000-0000-4000-8000-000000000001';

describe('invitations query', () => {
  it('round-trips the academy, the search and the page', () => {
    const query = parseInvitationsQuery(
      `academy=${academyId}&q=parent%40example.com&page=3`,
    );
    expect(serializeInvitationsQuery(query)).toBe(
      `q=parent%40example.com&academy=${academyId}&page=3`,
    );
  });

  it('keeps status and delivery as separate filters', () => {
    // §2.3 — an invitation is routinely PENDING and BOUNCED at once, so an
    // address that merged the two could not express either.
    const query = parseInvitationsQuery('status=PENDING&delivery=BOUNCED');
    expect(query.statuses).toEqual(['PENDING']);
    expect(query.deliveryStates).toEqual(['BOUNCED']);
    expect(serializeInvitationsQuery(query)).toBe(
      'status=PENDING&delivery=BOUNCED',
    );
  });

  it('leaves every default out of the address', () => {
    // The defaults have to serialize to nothing, or the server-rendered
    // `initialKey` never matches the client's and the first paint refetches a
    // page it was just handed.
    expect(serializeInvitationsQuery(parseInvitationsQuery(''))).toBe('');
    expect(
      serializeInvitationsQuery(parseInvitationsQuery('sort=sent&dir=desc')),
    ).toBe('');
  });

  it('falls back on anything the contract does not allow', () => {
    // The value reaches an `orderBy`. A bookmark, a chat message and a
    // hand-edited address all arrive here, so an unknown key is a page rather
    // than an error — and never a column name forwarded to the API.
    const query = parseInvitationsQuery(
      'sort=DROP+TABLE&dir=sideways&status=NOPE&delivery=MAYBE&academy=nope',
    );
    expect(query.sort).toBe('sent');
    expect(query.direction).toBe('desc');
    expect(query.statuses).toEqual([]);
    expect(query.deliveryStates).toEqual([]);
    expect(query.academyIds).toEqual([]);
  });

  it('addresses the page with the state it is showing', () => {
    const query = parseInvitationsQuery('needs=1&sort=expires&dir=asc');
    expect(invitationsPath(query)).toBe(
      '/admin/invitations?needs=1&sort=expires&dir=asc',
    );
  });
});
