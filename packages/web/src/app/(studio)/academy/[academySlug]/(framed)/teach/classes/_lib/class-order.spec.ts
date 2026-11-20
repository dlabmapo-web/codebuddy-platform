import { describe, expect, it } from 'vitest';

import { isClassActive, orderClassesByActivity } from './class-order';

const classes = ['a', 'b', 'c', 'd', 'e'].map((classId) => ({ classId }));
const order = (counts: Parameters<typeof orderClassesByActivity>[1]) =>
  orderClassesByActivity(classes, counts).map((item) => item.classId);

describe('orderClassesByActivity (QA T-01)', () => {
  it('keeps the server order while nothing is live', () => {
    expect(order({})).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('puts classes with students solving first, then online, then the rest', () => {
    expect(order({
      b: { online: 3, solving: 0 },
      d: { online: 2, solving: 2 },
      e: { online: 1, solving: 1 },
    })).toEqual(['d', 'e', 'b', 'a', 'c']);
  });

  it('keeps equal classes in the original order', () => {
    expect(order({ c: { online: 1, solving: 0 }, a: { online: 1, solving: 0 } })).toEqual(['a', 'c', 'b', 'd', 'e']);
  });
});

describe('isClassActive', () => {
  it('is true only when somebody is online or solving', () => {
    expect(isClassActive(undefined)).toBe(false);
    expect(isClassActive({ online: 0, solving: 0 })).toBe(false);
    expect(isClassActive({ online: 1, solving: 0 })).toBe(true);
  });
});
