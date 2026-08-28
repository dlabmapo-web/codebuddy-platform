import { describe, expect, it } from 'vitest';

import {
  courseAccent,
  courseAccentClasses,
  courseAccents,
} from './course-accent';

const ids = Array.from(
  { length: 400 },
  (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
);

describe('courseAccent', () => {
  it('gives the same course the same hue every time', () => {
    // The whole point: a colour a student can learn. A course that changed
    // hue between two visits would be worse than no colour at all.
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    expect(courseAccent(id)).toBe(courseAccent(id));
  });

  it('only ever answers with a hue the stylesheet defines', () => {
    for (const id of ids) {
      expect(courseAccents).toContain(courseAccent(id));
    }
  });

  it('spreads across all four rather than favouring one', () => {
    // A hash that piled 90% of courses onto one hue would pass the two checks
    // above and still leave the catalog looking monochrome.
    const counts = new Map(courseAccents.map((accent) => [accent, 0]));
    for (const id of ids) {
      counts.set(courseAccent(id), (counts.get(courseAccent(id)) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(ids.length / courseAccents.length / 2);
    }
  });

  it('distinguishes ids that differ only in their last character', () => {
    // Course ids are UUIDs that often share a long prefix, so a hash that only
    // really read the start would colour a whole academy identically.
    const seen = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((last) =>
        courseAccent(`3f2504e0-4f89-11d3-9a0c-030500000${last}`),
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('has a class pair for every hue', () => {
    for (const accent of courseAccents) {
      expect(courseAccentClasses[accent].spine).toContain(accent);
      expect(courseAccentClasses[accent].tile).toContain(accent);
    }
  });
});
