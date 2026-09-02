import { describe, expect, it } from 'vitest';

import { contentDetailHref } from './content-view';

describe('contentDetailHref', () => {
  it('keeps every editor inside the console', () => {
    const links = [
      contentDetailHref.course({ academySlug: 'mapo', id: 'course' }),
      contentDetailHref.class({ academySlug: 'mapo', id: 'class' }),
      contentDetailHref.problem({
        academySlug: 'mapo',
        courseId: 'course',
        lectureId: 'lecture',
        materialId: 'problem',
      }),
    ];
    expect(links).toEqual([
      '/admin/academies/mapo/courses/course',
      '/admin/academies/mapo/classes/class',
      '/admin/academies/mapo/courses/course/lectures/lecture/exercises/problem',
    ]);
    // The regression this pins is silent: a support-grant href still renders a
    // working link, and lands the operator in an impersonation flow.
    expect(links.join(' ')).not.toContain('/admin/access/new');
  });
});
