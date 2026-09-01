import { describe, expect, it } from 'vitest';

import { createContentPaths } from './content-paths';

describe('content editor paths', () => {
  it('mounts one editor route map under the academy and console shells', () => {
    const academy = createContentPaths('mapo-dlab', 'academy');
    const console = createContentPaths('mapo-dlab', 'console');

    expect(academy.course('course-1')).toBe(
      '/academy/mapo-dlab/content/courses/course-1',
    );
    expect(console.course('course-1')).toBe(
      '/admin/academies/mapo-dlab/courses/course-1',
    );
    expect(academy.class('class-1')).toBe('/academy/mapo-dlab/classes/class-1');
    expect(console.class('class-1')).toBe(
      '/admin/academies/mapo-dlab/classes/class-1',
    );
  });

  it('keeps exercise links in the selected shell and encodes every segment', () => {
    expect(
      createContentPaths('mapo dlab', 'console').exercise(
        'course/1',
        'lecture 1',
        'problem?1',
      ),
    ).toBe(
      '/admin/academies/mapo%20dlab/courses/course%2F1/lectures/lecture%201/exercises/problem%3F1',
    );
  });
});
