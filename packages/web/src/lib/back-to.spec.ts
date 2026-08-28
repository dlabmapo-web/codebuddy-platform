import { describe, expect, it } from 'vitest';

import { backTo } from './back-to';

const academy = 'dlab-mapo';
const classId = 'a0000000-0000-4000-8000-000000000001';

/**
 * These pin the navigation graph rather than the implementation.
 *
 * A back control that lands on the wrong page is worse than none, because it
 * looks reliable — so the destinations are asserted as literal paths. A route
 * that moves has to be moved here too, deliberately.
 */
describe('backTo', () => {
  it('sends a member profile to the directory it is a row in', () => {
    expect(backTo.academyPerson(academy)).toBe('/academy/dlab-mapo/people');
  });

  it('sends a student ledger to the ranking that named them', () => {
    expect(backTo.academyStudentPoints(academy)).toBe(
      '/academy/dlab-mapo/points/classes',
    );
  });

  it('climbs one level from progress, not all the way to the class list', () => {
    // A teacher reading progress came from that class. Skipping it would make
    // back a shortcut out of the section rather than a step up in it.
    expect(backTo.academyTeachProgress(academy, classId)).toBe(
      `/academy/dlab-mapo/teach/classes/${classId}`,
    );
  });

  it('sends a submission to the progress table it was opened from', () => {
    expect(backTo.academyTeachSubmission(academy, classId)).toBe(
      `/academy/dlab-mapo/teach/classes/${classId}/progress`,
    );
  });

  it('sends the import wizard to the course it imports into', () => {
    expect(backTo.academyCourseImport(academy, 'course-1')).toBe(
      '/academy/dlab-mapo/content/courses/course-1',
    );
  });

  it('sends both platform academy pages to the academy list', () => {
    expect(backTo.platformAcademy()).toBe('/admin/academies');
    expect(backTo.platformAcademyNew()).toBe('/admin/academies');
  });

  it('never sends a page back to itself', () => {
    // The one failure mode that renders as a control doing nothing at all.
    expect(backTo.academyTeachProgress(academy, classId)).not.toContain(
      '/progress',
    );
    expect(backTo.academyLearnClass(academy)).toBe(
      '/academy/dlab-mapo/learn/classes',
    );
  });

  it('escapes ids rather than trusting them in a path', () => {
    expect(backTo.academyCourseImport(academy, 'a/b')).toBe(
      '/academy/dlab-mapo/content/courses/a%2Fb',
    );
  });
});
