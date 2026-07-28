import { describe, expect, it } from 'vitest';
import { resolveTeacherStudentScope } from './studentScope';

describe('resolveTeacherStudentScope', () => {
  it('shows all active students when a teacher has no explicit assignments', () => {
    expect(resolveTeacherStudentScope([])).toEqual({ kind: 'all' });
  });

  it('limits a teacher to explicitly assigned students when mappings exist', () => {
    expect(resolveTeacherStudentScope(['student-1', 'student-2', 'student-1'])).toEqual({
      kind: 'assigned',
      studentIds: ['student-1', 'student-2'],
    });
  });
});
