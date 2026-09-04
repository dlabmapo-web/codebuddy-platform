import { describe, expect, it } from 'vitest';

import { routes } from '@/lib/routes';

import { lobbyNav, lobbySectionFor } from './lobby-nav';

const academySlug = 'dlab-mapo';

function ids(kind: 'STUDENT' | 'STAFF', hasPoints: boolean) {
  return lobbyNav({ academySlug, kind, hasPoints }).map((item) => item.id);
}

describe('the applicant lobby navigation', () => {
  it('gives a student applicant the pages a student reads', () => {
    expect(ids('STUDENT', true)).toEqual([
      'overview',
      'my_courses',
      'my_classes',
      'records',
      'my_points',
    ]);
  });

  it('gives a staff applicant the widest staff shape', () => {
    // Somebody approved as a Teacher will find this narrows to theirs. The
    // lobby shows what the academy does, never a promise about what this
    // person will be allowed to do.
    expect(ids('STAFF', true)).toEqual([
      'overview',
      'my_courses',
      'courses',
      'classes',
      'ranking',
    ]);
  });

  it.each(['STUDENT', 'STAFF'] as const)(
    'hides the point rows from a %s applicant when the academy does not run points',
    (kind) => {
      // The member sidebar gates them the same way. A row that vanishes on
      // approval is worse than one that was never there.
      expect(ids(kind, false)).not.toContain('my_points');
      expect(ids(kind, false)).not.toContain('ranking');
    },
  );

  it('keeps every row on the academy root, with the section as a query', () => {
    /*
     * The bug this replaced: rows pointing at the member addresses these
     * sections will eventually have. Next renders a layout and the page under
     * it in parallel, so `learn/courses/page.tsx` executed and refused the
     * applicant — a 404 on every row but the overview — even though the framed
     * layout discards `children`.
     */
    const items = lobbyNav({ academySlug, kind: 'STUDENT', hasPoints: true });
    const root = routes.academy(academySlug);

    expect(items.map((item) => item.href)).toEqual([
      root,
      `${root}?section=my_courses`,
      `${root}?section=my_classes`,
      `${root}?section=records`,
      `${root}?section=my_points`,
    ]);
    for (const item of items) {
      expect(item.href.startsWith(`${root}?`) || item.href === root).toBe(true);
    }
  });

  it('gives each section the hue it will wear once it holds something', () => {
    const items = lobbyNav({ academySlug, kind: 'STUDENT', hasPoints: true });
    expect(items.map((item) => item.tone)).toEqual([
      'draft',
      'brand',
      'peer',
      'teal',
      'warning',
    ]);
  });
});

describe('resolving the section from the query', () => {
  const items = lobbyNav({ academySlug, kind: 'STUDENT', hasPoints: true });

  it('selects the section the query names', () => {
    expect(lobbySectionFor('my_classes', items).id).toBe('my_classes');
    expect(lobbySectionFor('records', items).id).toBe('records');
  });

  it('falls back to the overview when no section is named', () => {
    expect(lobbySectionFor(null, items).id).toBe('overview');
  });

  it('refuses a section this applicant does not have', () => {
    // `ranking` belongs to the staff lobby. A hand-typed query must not select
    // a page the sidebar does not offer.
    expect(lobbySectionFor('ranking', items).id).toBe('overview');
    expect(lobbySectionFor('../../etc', items).id).toBe('overview');
  });
});
