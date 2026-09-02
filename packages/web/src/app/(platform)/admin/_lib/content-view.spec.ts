import { describe, expect, it } from 'vitest';

import { contentDetailHref, contentLensFromReferrer } from './content-view';

describe('contentDetailHref', () => {
  it('keeps every editor inside the console', () => {
    const links = [
      contentDetailHref.course({ academySlug: 'mapo', id: 'course' }),
      contentDetailHref.class({ academySlug: 'mapo', id: 'class' }),
    ];
    expect(links).toEqual([
      '/admin/academies/mapo/courses/course',
      '/admin/academies/mapo/classes/class',
    ]);
    // The regression this pins is silent: a support-grant href still renders a
    // working link, and lands the operator in an impersonation flow.
    expect(links.join(' ')).not.toContain('/admin/access/new');
  });
});

describe('contentLensFromReferrer', () => {
  it('lights the page the editor was opened from', () => {
    expect(contentLensFromReferrer('/admin/content/classes')).toBe(
      '/admin/content/classes',
    );
    expect(
      contentLensFromReferrer('/admin/content/courses?academy=abc&page=2'),
    ).toBe('/admin/content/courses');
  });

  it('stays on Courses for the whole descent into a problem', () => {
    // The console's claim is that a problem lives inside its course. A rail
    // that switched rows on the way down would be contradicting the page the
    // operator is reading.
    expect(contentLensFromReferrer('/admin/content/courses')).toBe(
      '/admin/content/courses',
    );
  });

  it('lights nothing for anywhere else', () => {
    expect(contentLensFromReferrer(undefined)).toBeNull();
    expect(contentLensFromReferrer('/admin/users')).toBeNull();
    // The retired problems address. It only redirects now, so lighting a row
    // for it would name a page the operator is not going to.
    expect(contentLensFromReferrer('/admin/content/problems')).toBeNull();
  });
});
