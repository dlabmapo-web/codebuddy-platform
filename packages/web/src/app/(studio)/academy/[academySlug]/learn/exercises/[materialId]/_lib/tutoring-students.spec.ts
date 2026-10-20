import { describe, expect, it } from 'vitest';
import { matchesTutoringStudent } from './tutoring-students';
const student = { displayName: 'Jane Student', username: 'jane01', email: 'jane@example.test', state: 'OFFLINE' as const, materialId: 'problem', attempts: 0 };
describe('tutoring roster filters', () => {
  it('includes offline and unsubmitted students in the full class list', () => {
    expect(matchesTutoringStudent(student, 'all', '', 'problem')).toBe(true);
  });
  it('searches names, email and IDs without case sensitivity', () => {
    for (const term of [' JANE ', 'EXAMPLE.TEST', 'jane01']) expect(matchesTutoringStudent(student, 'all', term, 'problem')).toBe(true);
    expect(matchesTutoringStudent(student, 'all', 'another person', 'problem')).toBe(false);
  });
  it('requires exact-problem solving presence for the online filter', () => {
    expect(matchesTutoringStudent({ ...student, state: 'SOLVING' }, 'online', '', 'problem')).toBe(true);
    for (const state of ['OFFLINE', 'IDLE', 'RECONNECTING'] as const) expect(matchesTutoringStudent({ ...student, state }, 'online', '', 'problem')).toBe(false);
    expect(matchesTutoringStudent({ ...student, state: 'SOLVING', materialId: 'other' }, 'online', '', 'problem')).toBe(false);
  });
  it('distinguishes unsubmitted from unavailable submission status', () => {
    expect(matchesTutoringStudent(student, 'not-submitted', '', 'problem')).toBe(true);
    expect(matchesTutoringStudent({ ...student, attempts: null }, 'not-submitted', '', 'problem')).toBe(false);
    expect(matchesTutoringStudent({ ...student, attempts: 2 }, 'submitted', '', 'problem')).toBe(true);
  });
});
