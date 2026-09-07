import { describe, expect, it } from 'vitest';

import { redirectSlugFor, type SelectableMembership } from './academy-selection';

const memberships: SelectableMembership[] = [
  { academyId: 'a-1', academySlug: 'dlab-mapo', status: 'ACTIVE' },
  { academyId: 'a-2', academySlug: 'mapo-dlab', status: 'ACTIVE' },
  { academyId: 'a-3', academySlug: 'left-behind', status: 'LEFT' },
];

describe('redirectSlugFor', () => {
  it('resolves an active membership to the slug its My Page now lives at', () => {
    expect(redirectSlugFor(memberships, 'a-2')).toBe('mapo-dlab');
  });

  it('has nowhere to send a reader who named nothing', () => {
    expect(redirectSlugFor(memberships, null)).toBeNull();
  });

  it('refuses an academy the caller is no longer in', () => {
    expect(redirectSlugFor(memberships, 'a-3')).toBeNull();
  });

  it('refuses an academy the caller was never in', () => {
    expect(redirectSlugFor(memberships, 'a-999')).toBeNull();
  });

  it('has nowhere to send an account with no memberships at all', () => {
    expect(redirectSlugFor([], 'a-1')).toBeNull();
  });
});
