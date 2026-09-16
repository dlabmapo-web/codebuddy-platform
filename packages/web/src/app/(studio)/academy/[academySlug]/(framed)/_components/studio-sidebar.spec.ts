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
  canReadAcademyMembers: boolean;
  canReviewApplications: boolean;
  canMonitor?: boolean;
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
    canReadAcademyMembers: false,
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
      canReadAcademyMembers: true,
      canReviewApplications: true,
    })).toEqual([
      '/academy/cove-development/people',
      '/academy/cove-development/students',
      '/academy/cove-development/staff',
      '/academy/cove-development/applications',
      '/academy/cove-development/invitations',
    ]);
  });

  it('shows the rosters but not the directory to a team lead', () => {
    // Looking somebody up and changing them are different authorities. The
    // directory edits, so it stays behind the Manager's role; the two rosters
    // only read, and a Team Lead holds `academy.members.read`.
    expect(peopleLinks({
      canManageAcademy: false,
      canReadAcademyMembers: true,
      canReviewApplications: true,
    })).toEqual([
      '/academy/cove-development/students',
      '/academy/cove-development/staff',
      '/academy/cove-development/applications',
    ]);
  });

  it('shows only applications to a reviewer who may not read members', () => {
    expect(peopleLinks({
      canManageAcademy: false,
      canReadAcademyMembers: false,
      canReviewApplications: true,
    })).toEqual(['/academy/cove-development/applications']);
  });

  it('shows no people group without any of the three', () => {
    expect(peopleLinks({
      canManageAcademy: false,
      canReadAcademyMembers: false,
      canReviewApplications: false,
    })).toEqual([]);
  });
});

describe("whose Students link a rail draws", () => {
  it("gives a team lead the academy's two rosters", () => {
    expect(
      peopleLinks({
        canManageAcademy: false,
        canReadAcademyMembers: true,
        canReviewApplications: false,
      }),
    ).toEqual([
      '/academy/cove-development/students',
      '/academy/cove-development/staff',
    ]);
  });

  it("gives a teacher their own students, and neither academy roster", () => {
    // A teacher holds `academy.members.read` — it is what lets them see the
    // names of the children they teach — but the academy-wide rosters refuse
    // them, so a rail that offered those two links was offering a refusal.
    // What they get instead is the list bounded by their own assignment.
    expect(
      peopleLinks({
        canManageAcademy: false,
        canReadAcademyMembers: false,
        canReviewApplications: false,
        canMonitor: true,
      }),
    ).toEqual(['/academy/cove-development/teach/students']);
  });

  it("gives a manager the directory as well as the rosters", () => {
    expect(
      peopleLinks({
        canManageAcademy: true,
        canReadAcademyMembers: true,
        canReviewApplications: false,
        canMonitor: true,
      }),
    ).toEqual([
      '/academy/cove-development/people',
      '/academy/cove-development/students',
      '/academy/cove-development/staff',
      // The directory's own companion, unrelated to the rosters.
      '/academy/cove-development/invitations',
    ]);
  });
});
