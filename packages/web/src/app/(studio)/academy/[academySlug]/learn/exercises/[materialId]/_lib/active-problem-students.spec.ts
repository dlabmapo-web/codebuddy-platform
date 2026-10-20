import { describe, expect, it } from 'vitest';
import type { PresenceEntry, TeacherRosterStudent } from '@cove/shared';
import { activeProblemStudents } from './active-problem-students';
const students = ['solving', 'idle', 'offline', 'reconnecting', 'other-problem', 'other-course'].map((membershipId) => ({ membershipId }) as TeacherRosterStudent);
function entry(studentMembershipId: string, overrides: Partial<PresenceEntry> = {}): PresenceEntry {
  return { studentMembershipId, state: 'SOLVING', courseId: 'course', materialId: 'problem', ...overrides } as PresenceEntry;
}
describe('active problem students', () => {
  it('includes only enrolled students actively solving this exact course and problem', () => {
    const presence = [entry('solving'), entry('idle', { state: 'IDLE' }), entry('offline', { state: 'OFFLINE' }),
      entry('reconnecting', { state: 'RECONNECTING' }), entry('other-problem', { materialId: 'elsewhere' }),
      entry('other-course', { courseId: 'elsewhere' }), entry('not-enrolled')];
    expect(activeProblemStudents(students, presence, 'course', 'problem')).toEqual([students[0]]);
  });
  it('removes students when presence or enrollment disappears and never duplicates a seat', () => {
    expect(activeProblemStudents(students, [], 'course', 'problem')).toEqual([]);
    expect(activeProblemStudents([], [entry('solving')], 'course', 'problem')).toEqual([]);
    expect(activeProblemStudents(students, [entry('solving'), entry('solving')], 'course', 'problem')).toEqual([students[0]]);
  });
});
