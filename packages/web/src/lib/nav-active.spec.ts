import { describe, expect, it } from 'vitest';

import { activeNavHref } from './nav-active';

const base = '/academy/a1';
const hrefs = [
  base,
  `${base}/content/courses`,
  `${base}/members`,
  `${base}/invitations`,
];

describe('activeNavHref', () => {
  it('marks the index link only on the index itself', () => {
    expect(activeNavHref(base, hrefs)).toBe(base);
  });

  it('prefers the specific link over the index that prefixes it', () => {
    expect(activeNavHref(`${base}/content/courses`, hrefs)).toBe(
      `${base}/content/courses`,
    );
    expect(activeNavHref(`${base}/members`, hrefs)).toBe(`${base}/members`);
  });

  it('keeps the section active on its nested pages', () => {
    expect(
      activeNavHref(
        `${base}/content/courses/c1/versions/v1/lectures/l1/exercises/new`,
        hrefs,
      ),
    ).toBe(`${base}/content/courses`);
  });

  it('does not match a sibling that shares a name prefix', () => {
    expect(activeNavHref(`${base}/members-archive`, hrefs)).toBe(base);
  });

  it('returns null when nothing matches', () => {
    expect(activeNavHref('/login', hrefs)).toBeNull();
  });

  // The Learning group holds two sibling entries. They must never light up
  // together: a student on a class page is not also in the course catalog.
  it('keeps the two learning entries mutually exclusive', () => {
    const learning = [`${base}/learn/courses`, `${base}/learn/classes`];

    expect(activeNavHref(`${base}/learn/classes`, learning)).toBe(
      `${base}/learn/classes`,
    );
    expect(activeNavHref(`${base}/learn/classes/c1`, learning)).toBe(
      `${base}/learn/classes`,
    );
    expect(activeNavHref(`${base}/learn/courses/c1`, learning)).toBe(
      `${base}/learn/courses`,
    );
  });

  /**
   * A teacher's Students link asks for one of two views of one route, so it
   * carries a query. `usePathname` never returns one, so a literal comparison
   * meant the link could never be current — and the academy index, which
   * prefixes every page, lit up Overview instead on every page it covers.
   */
  it('matches a link that carries a query string', () => {
    const withQuery = `${base}/teach/students?tab=all`;
    const teaching = [base, withQuery];

    expect(activeNavHref(`${base}/teach/students`, teaching)).toBe(withQuery);
    expect(activeNavHref(`${base}/teach/students/s1`, teaching)).toBe(
      withQuery,
    );
    expect(activeNavHref(base, teaching)).toBe(base);
  });

  /**
   * The member detail page serves three roles and sits under none of their
   * lists. Whichever list sends a reader there has to claim it, or the academy
   * index wins by prefix and Overview lights up on a page that is not it.
   */
  it('lets an entry own a path it does not link to', () => {
    const teacher = [
      base,
      { href: `${base}/teach/students`, paths: [`${base}/students`] },
    ];

    expect(activeNavHref(`${base}/students/m1`, teacher)).toBe(
      `${base}/teach/students`,
    );
    expect(activeNavHref(`${base}/teach/students`, teacher)).toBe(
      `${base}/teach/students`,
    );
    // Nothing owned, nothing claimed: the index keeps its own page.
    expect(activeNavHref(base, teacher)).toBe(base);
  });

  it('keeps two sibling teaching routes apart', () => {
    // They were one route with a `view` parameter, and a highlight is decided
    // on the path — so one of them could never be current.
    const teaching = [`${base}/teach/students`, `${base}/teach/analytics`];

    expect(activeNavHref(`${base}/teach/students`, teaching)).toBe(
      `${base}/teach/students`,
    );
    expect(activeNavHref(`${base}/teach/analytics`, teaching)).toBe(
      `${base}/teach/analytics`,
    );
  });
});
