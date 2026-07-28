import { describe, expect, it } from 'vitest';
import {
  ROLE_HOME,
  canAccessPath,
  getProtectedRoute,
  matchesRoutePrefix,
} from './capabilities';

describe('navigation capabilities', () => {
  it('matches route boundaries instead of similarly prefixed paths', () => {
    expect(matchesRoutePrefix('/problems/123', '/problems')).toBe(true);
    expect(matchesRoutePrefix('/problems-old', '/problems')).toBe(false);
  });

  it('keeps monitoring and live feedback teacher-only', () => {
    expect(canAccessPath('teacher', '/dashboard')).toBe(true);
    expect(canAccessPath('teacher', '/students')).toBe(true);
    expect(canAccessPath('teacher', '/progress')).toBe(true);
    expect(canAccessPath('teacher', '/feedback/session-1')).toBe(true);
    expect(canAccessPath('admin', '/dashboard')).toBe(false);
    expect(canAccessPath('admin', '/students')).toBe(false);
    expect(canAccessPath('admin', '/progress')).toBe(false);
    expect(canAccessPath('admin', '/feedback/session-1')).toBe(false);
  });

  it('keeps student, teacher, and admin management boundaries', () => {
    expect(canAccessPath('teacher', '/problems/1')).toBe(false);
    expect(canAccessPath('student', '/students')).toBe(false);
    expect(canAccessPath('teacher', '/admin/problems')).toBe(false);
    expect(canAccessPath('admin', '/admin/problems')).toBe(true);
  });

  it('returns the correct role homes and route capability', () => {
    expect(ROLE_HOME).toEqual({
      student: '/problems',
      teacher: '/students',
      admin: '/admin/problems',
    });
    expect(getProtectedRoute('/feedback/session-1')?.capability).toBe('live-feedback');
  });
});
