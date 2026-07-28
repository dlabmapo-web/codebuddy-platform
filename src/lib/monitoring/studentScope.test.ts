import { describe, expect, it } from 'vitest';
import {
  canAccessStudent,
  resolveTeacherStudentScope,
} from './studentScope';

describe('resolveTeacherStudentScope', () => {
  it('shows all active students when a teacher has no explicit assignments', () => {
    expect(resolveTeacherStudentScope([])).toEqual({ kind: 'all' });
  });

  it('limits a teacher to explicitly assigned students when mappings exist', () => {
    const scope = resolveTeacherStudentScope(['student-1', 'student-2', 'student-1']);

    expect(scope).toEqual({
      kind: 'assigned',
      studentIds: ['student-1', 'student-2'],
    });
    expect(canAccessStudent(scope, 'student-1')).toBe(true);
    expect(canAccessStudent(scope, 'student-3')).toBe(false);
  });

  it('allows any student through the MVP fallback scope', () => {
    expect(
      canAccessStudent(resolveTeacherStudentScope([]), 'student-3')
    ).toBe(true);
  });
});
