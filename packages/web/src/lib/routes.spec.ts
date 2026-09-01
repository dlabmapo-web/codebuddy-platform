import { describe, expect, it } from 'vitest';

import { compatibilityRedirects, routes } from './routes';

describe('canonical Cove Studio routes', () => {
  it('owns human and technical authentication destinations', () => {
    expect(routes.home).toBe('/');
    expect(routes.login).toBe('/login');
    expect(routes.signup).toBe('/signup');
    expect(routes.forgotPassword).toBe('/forgot-password');
    expect(routes.resetPassword).toBe('/reset-password');
    expect(routes.welcome).toBe('/welcome');
    expect(routes.pending).toBe('/pending');
    expect(routes.invite).toBe('/invite');
    expect(routes.invitation('a/b')).toBe('/invite/a%2Fb');
    expect(routes.account).toBe('/account');
    expect(routes.authCallback).toBe('/auth/callback');
    expect(routes.recoveryConfirm).toBe('/auth/recovery/confirm');
  });

  it('owns academy destinations by immutable slug', () => {
    const slug = 'cove-seoul';
    expect(routes.academy(slug)).toBe('/academy/cove-seoul');
    expect(routes.academyClasses(slug)).toBe('/academy/cove-seoul/classes');
    expect(routes.academyClass(slug, 'class-1')).toBe('/academy/cove-seoul/classes/class-1');
    expect(routes.academyCourses(slug)).toBe('/academy/cove-seoul/content/courses');
    expect(routes.academyCourse(slug, 'course-1')).toBe('/academy/cove-seoul/content/courses/course-1');
    expect(routes.academyLearnCourse(slug, 'course-1', { classId: 'class-1' })).toBe('/academy/cove-seoul/learn/courses/course-1?classId=class-1');
    expect(routes.academyLearnClasses(slug)).toBe('/academy/cove-seoul/learn/classes');
    expect(routes.academyLearnRecords(slug)).toBe('/academy/cove-seoul/learn/records');
    expect(routes.academyLearnExercise(slug, 'material-1')).toBe('/academy/cove-seoul/learn/exercises/material-1');
    expect(routes.academyTeachClasses(slug)).toBe('/academy/cove-seoul/teach/classes');
    expect(routes.academyTeachStudents(slug)).toBe('/academy/cove-seoul/teach/students');
    expect(routes.academyPeople(slug)).toBe('/academy/cove-seoul/people');
    expect(routes.academyPerson(slug, 'member-1')).toBe('/academy/cove-seoul/people/member-1');
    expect(routes.academyApplications(slug)).toBe('/academy/cove-seoul/applications');
    expect(routes.academyInvitations(slug)).toBe('/academy/cove-seoul/invitations');
    expect(routes.academyPoints(slug)).toBe('/academy/cove-seoul/points');
  });

  it('owns platform administration destinations', () => {
    expect(routes.admin).toBe('/admin');
    expect(routes.adminAcademies).toBe('/admin/academies');
    expect(routes.adminAcademyNew).toBe('/admin/academies/new');
    expect(routes.adminAcademy('cove-seoul')).toBe('/admin/academies/cove-seoul');
    expect(routes.adminAcademyCourses('cove-seoul')).toBe(
      '/admin/academies/cove-seoul/courses',
    );
    expect(routes.adminAcademyCourse('cove-seoul', 'course/1')).toBe(
      '/admin/academies/cove-seoul/courses/course%2F1',
    );
    expect(routes.adminAcademyClasses('cove-seoul')).toBe(
      '/admin/academies/cove-seoul/classes',
    );
    expect(routes.adminAcademyClass('cove-seoul', 'class-1')).toBe(
      '/admin/academies/cove-seoul/classes/class-1',
    );
  });

  it('keeps only the approved temporary redirects', () => {
    expect(compatibilityRedirects).toEqual([
      { source: '/auth/login', destination: '/login', permanent: false },
      { source: '/auth/signup', destination: '/signup', permanent: false },
      { source: '/auth/forgot', destination: '/forgot-password', permanent: false },
      { source: '/auth/reset-password', destination: '/reset-password', permanent: false },
      { source: '/studio/my-page', destination: '/account', permanent: false },
    ]);
  });
});
