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
  canRunMaintenance: false,
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

function curriculumLinks(options: {
  canManageContent: boolean;
  canRunMaintenance: boolean;
}) {
  const group = studioNavGroups({
    ...common,
    canManageAcademy: false,
    canReviewApplications: false,
    ...options,
  })
    .find(({ id }) => id === 'content');
  return group?.items.map(({ href }) => href) ?? [];
}

describe('curriculum maintenance in the rail', () => {
  it('shows the maintenance row to somebody who may re-grade', () => {
    expect(
      curriculumLinks({ canManageContent: true, canRunMaintenance: true }),
    ).toEqual([
      '/academy/cove-development/content/courses',
      '/academy/cove-development/maintenance',
    ]);
  });

  it('hides it from a teacher, who may read curriculum but not repair it', () => {
    expect(
      curriculumLinks({ canManageContent: true, canRunMaintenance: false }),
    ).toEqual(['/academy/cove-development/content/courses']);
  });

  it('leaves the group out entirely when neither row is held', () => {
    // A student. An empty heading would be worse than no heading.
    expect(
      curriculumLinks({ canManageContent: false, canRunMaintenance: false }),
    ).toEqual([]);
  });
});

describe('studio application navigation', () => {
  it('shows all people links to a manager', () => {
    expect(peopleLinks({
      canManageAcademy: true,
      canReviewApplications: true,
    })).toEqual([
      '/academy/cove-development/people',
      '/academy/cove-development/students',
      '/academy/cove-development/staff',
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
