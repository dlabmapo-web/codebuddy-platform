import { describe, expect, it } from 'vitest';
import type { AuthMeResponse } from '@cove/shared';

import {
  authDestination,
  academyRoleFor,
  canManageContent,
  canManageAcademy,
  canManageClasses,
  canManageClassTeachers,
  canManageEnrollment,
  canManageExercises,
  canPublishContent,
  canReviewContent,
  isStudent,
  pendingStateView,
  resolveAcademyAccessState,
} from './academy-access-state';

const academy = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Cove Development Academy',
  slug: 'cove-development',
};

function account(overrides: Partial<AuthMeResponse['user']> = {}): AuthMeResponse {
  return {
    user: {
      id: '30000000-0000-4000-8000-000000000001',
      authUserId: '40000000-0000-4000-8000-000000000001',
      email: 'user@cove.test',
      username: 'cove-user',
      displayName: 'Cove User',
      avatarUrl: null,
      platformRole: 'USER',
      status: 'ACTIVE',
      memberships: [],
      applications: [],
      ...overrides,
    },
  };
}

function application(status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED') {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    academy,
    status,
    approvedRole: status === 'APPROVED' ? 'STUDENT' as const : null,
    reviewReason: status === 'REJECTED' ? 'Not eligible yet' : null,
    createdAt: '2026-07-23T00:00:00.000Z',
    reviewedAt: status === 'PENDING' ? null : '2026-07-23T01:00:00.000Z',
  };
}

describe('resolveAcademyAccessState', () => {
  it('prioritizes an active membership over historical applications', () => {
    const result = resolveAcademyAccessState(account({
      memberships: [{ academy, role: 'TEACHER', status: 'ACTIVE' }],
      applications: [application('APPROVED')],
    }));

    expect(result.kind).toBe('active');
    expect(authDestination(account({
      memberships: [{ academy, role: 'TEACHER', status: 'ACTIVE' }],
    }))).toBe(`/studio/academies/${academy.id}`);
  });

  it('routes a suspended membership to the pending access surface', () => {
    const input = account({
      memberships: [{ academy, role: 'STUDENT', status: 'SUSPENDED' }],
      applications: [application('APPROVED')],
    });

    expect(resolveAcademyAccessState(input).kind).toBe('suspended');
    expect(authDestination(input)).toBe('/auth/pending');
    expect(pendingStateView(resolveAcademyAccessState(input))).toMatchObject({
      state: 'suspended',
      canCancel: false,
      canReapply: false,
    });
  });

  it.each([
    ['PENDING', 'pending', true, false],
    ['APPROVED', 'application_approved', false, false],
    ['REJECTED', 'rejected', false, true],
    ['CANCELLED', 'cancelled', false, true],
  ] as const)(
    'renders an accurate %s application state',
    (status, expectedState, canCancel, canReapply) => {
      const state = resolveAcademyAccessState(account({
        applications: [application(status)],
      }));
      expect(authDestination(account({
        applications: [application(status)],
      }))).toBe('/auth/pending');
      expect(pendingStateView(state)).toMatchObject({
        state: expectedState,
        canCancel,
        canReapply,
      });
    },
  );

  it('keeps an unrelated account on the welcome page', () => {
    const input = account();
    expect(resolveAcademyAccessState(input)).toEqual({ kind: 'welcome' });
    expect(authDestination(input)).toBe('/auth/welcome');
  });

  it('exposes academy management only to managers', () => {
    expect(canManageAcademy('MANAGER')).toBe(true);
    expect(canManageAcademy('TEAM_LEAD')).toBe(false);
    expect(canManageAcademy('TEACHER')).toBe(false);
    expect(canManageAcademy('STUDENT')).toBe(false);
    expect(canManageAcademy(null)).toBe(false);
  });

  it('lets managers review content without exposing authoring controls', () => {
    expect(canReviewContent('MANAGER')).toBe(true);
    expect(canManageContent('MANAGER')).toBe(false);
    expect(canManageExercises('MANAGER')).toBe(false);
    expect(canPublishContent('MANAGER')).toBe(false);
  });

  it('exposes content authoring to team leads', () => {
    expect(canManageContent('TEAM_LEAD')).toBe(true);
    expect(canManageExercises('TEAM_LEAD')).toBe(true);
    expect(canPublishContent('TEAM_LEAD')).toBe(true);
    expect(canManageContent('TEACHER')).toBe(false);
    expect(canManageContent('STUDENT')).toBe(false);
    expect(canManageContent(null)).toBe(false);
  });

  it('shows the Teaching group to team leads and managers only', () => {
    expect(canManageClasses('TEAM_LEAD')).toBe(true);
    expect(canManageClasses('MANAGER')).toBe(true);
    expect(canManageClasses('TEACHER')).toBe(false);
    expect(canManageClasses('STUDENT')).toBe(false);
    expect(canManageClasses(null)).toBe(false);
  });

  it('shows enrollment controls to managers alone', () => {
    expect(canManageEnrollment('MANAGER')).toBe(true);
    // A Team Lead reaches the class page and reads the roster, but the add
    // and remove controls stay hidden.
    expect(canManageClasses('TEAM_LEAD')).toBe(true);
    expect(canManageEnrollment('TEAM_LEAD')).toBe(false);
    expect(canManageEnrollment('TEACHER')).toBe(false);
    expect(canManageEnrollment('STUDENT')).toBe(false);
    expect(canManageEnrollment(null)).toBe(false);
  });

  it('shows teacher assignment controls to team leads and managers', () => {
    expect(canManageClassTeachers('TEAM_LEAD')).toBe(true);
    expect(canManageClassTeachers('MANAGER')).toBe(true);
    // A Teacher never chooses who runs a class, not even their own.
    expect(canManageClassTeachers('TEACHER')).toBe(false);
    expect(canManageClassTeachers('STUDENT')).toBe(false);
    expect(canManageClassTeachers(null)).toBe(false);
  });

  it('treats only a Student as a student', () => {
    // The gate behind the My Classes nav entry. Staff hold `curriculum.read`
    // so they can preview curriculum, and that must not read as enrollment.
    expect(isStudent('STUDENT')).toBe(true);
    expect(isStudent('TEACHER')).toBe(false);
    expect(isStudent('TEAM_LEAD')).toBe(false);
    expect(isStudent('MANAGER')).toBe(false);
    expect(isStudent(null)).toBe(false);
  });

  it('keeps My Courses as the academy landing destination for a student', () => {
    const destination = authDestination(account({
      memberships: [{ academy, role: 'STUDENT', status: 'ACTIVE' }],
    }));
    expect(destination).toBe(`/studio/academies/${academy.id}/learn/courses`);
  });

  it('resolves only active membership roles for the selected academy', () => {
    const input = account({
      memberships: [{ academy, role: 'MANAGER', status: 'ACTIVE' }],
    });
    expect(academyRoleFor(input, academy.id)).toBe('MANAGER');
    expect(
      academyRoleFor(input, '90000000-0000-4000-8000-000000000001'),
    ).toBeNull();
  });
});
