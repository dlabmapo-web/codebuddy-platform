import { describe, expect, it } from 'vitest';
import type { AuthMeResponse } from '@cove/shared';

import {
  legacyAcademyDestination,
  legacyAcademySlug,
} from './legacy-academy-route';

const academy = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Cove Development Academy',
  slug: 'cove-development',
};

function account(
  memberships: AuthMeResponse['user']['memberships'],
): AuthMeResponse {
  return {
    user: {
      id: '30000000-0000-4000-8000-000000000001',
      authUserId: '40000000-0000-4000-8000-000000000001',
      email: 'student@cove.test',
      username: 'student',
      displayName: 'Student',
      avatarUrl: null,
      imageUrl: null,
      emailIsPlaceholder: false,
      platformRole: 'USER',
      status: 'ACTIVE',
      memberships,
      applications: [],
    },
  };
}

describe('legacy academy routing', () => {
  it('resolves an academy UUID only from an active membership', () => {
    expect(legacyAcademySlug(account([
      { academy, role: 'STUDENT', roles: ['STUDENT'], status: 'ACTIVE', imageUrl: null },
    ]), academy.id)).toBe(academy.slug);

    expect(legacyAcademySlug(account([
      { academy, role: 'STUDENT', roles: ['STUDENT'], status: 'SUSPENDED', imageUrl: null },
    ]), academy.id)).toBeNull();
    expect(legacyAcademySlug(account([]), academy.id)).toBeNull();
  });

  it.each([
    'classes',
    'content',
    'learn',
    'teach',
    'people',
    'applications',
    'invitations',
    'points',
  ])('preserves the recognized %s route family', (family) => {
    expect(legacyAcademyDestination(academy.slug, [family, 'child']))
      .toBe(`/academy/${academy.slug}/${family}/child`);
  });

  it('falls back to Overview for an empty or unrecognized suffix', () => {
    expect(legacyAcademyDestination(academy.slug, undefined))
      .toBe(`/academy/${academy.slug}`);
    expect(legacyAcademyDestination(academy.slug, []))
      .toBe(`/academy/${academy.slug}`);
    expect(legacyAcademyDestination(academy.slug, ['unknown', 'child']))
      .toBe(`/academy/${academy.slug}`);
  });

  it('re-encodes every preserved suffix segment', () => {
    expect(legacyAcademyDestination(academy.slug, ['learn', '../problem one']))
      .toBe(`/academy/${academy.slug}/learn/..%2Fproblem%20one`);
  });
});
