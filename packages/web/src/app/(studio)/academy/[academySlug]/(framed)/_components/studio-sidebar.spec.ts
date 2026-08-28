import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  publicConfig: {
    apiUrl: 'http://localhost:4000/api/rpc',
    siteUrl: 'http://localhost:3000',
    supabasePublishableKey: 'test-key',
    supabaseUrl: 'http://localhost:54321',
  },
}));

import { studioNavGroups } from './studio-sidebar';

const common = {
  academySlug: 'cove-development',
  canLearn: true,
  canManageClasses: false,
  canManageContent: false,
  canMonitor: false,
  hasPoints: false,
  isStudent: false,
};

function peopleLinks(options: {
  canManageAcademy: boolean;
  canReviewApplications: boolean;
}) {
  const group = studioNavGroups({ ...common, ...options })
    .find(({ id }) => id === 'people');
  return group?.items.map(({ href }) => href) ?? [];
}

describe('studio application navigation', () => {
  it('shows all people links to a manager', () => {
    expect(peopleLinks({
      canManageAcademy: true,
      canReviewApplications: true,
    })).toEqual([
      '/academy/cove-development/people',
      '/academy/cove-development/applications',
      '/academy/cove-development/invitations',
    ]);
  });

  it('shows only applications to a team lead', () => {
    expect(peopleLinks({
      canManageAcademy: false,
      canReviewApplications: true,
    })).toEqual(['/academy/cove-development/applications']);
  });

  it('shows no people group without either permission', () => {
    expect(peopleLinks({
      canManageAcademy: false,
      canReviewApplications: false,
    })).toEqual([]);
  });
});
