import { describe, expect, it } from 'vitest';

import { activeNavHref } from './nav-active';

const base = '/studio/academies/a1';
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
    expect(activeNavHref('/auth/login', hrefs)).toBeNull();
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
});
