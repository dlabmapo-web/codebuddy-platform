import type { WorkspaceNavigatorContext } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import { materialOutlineNumbers } from './curriculum-navigator';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Only the fields the numbering reads; the rest of the context is irrelevant. */
function context(): WorkspaceNavigatorContext {
  return {
    course: {
      modules: [
        {
          position: 1,
          lectures: [
            {
              position: 1,
              explanations: [{ materialId: id(1), position: 1 }],
              exercises: [
                { materialId: id(2), position: 2 },
                { materialId: id(3), position: 4 },
              ],
              documents: [{ materialId: id(4), position: 3, pdf: { placement: 'SUPPLEMENTARY' } }],
            },
          ],
        },
        {
          position: 2,
          lectures: [
            { position: 1, exercises: [{ materialId: id(5), position: 1 }] },
            {
              position: 10,
              exercises: [{ materialId: id(6), position: 12 }],
              videos: [{ materialId: id(7), position: 3 }],
              manualMaterials: [{ materialId: id(8), position: 5 }],
            },
          ],
        },
      ],
    },
  } as unknown as WorkspaceNavigatorContext;
}

describe('materialOutlineNumbers', () => {
  it('prints module-lecture-material from stored positions, not a running count (QA-03)', () => {
    const numbers = materialOutlineNumbers(context());

    expect(numbers.get(id(2))).toBe('1-1-2');
    expect(numbers.get(id(3))).toBe('1-1-4');
    expect(numbers.get(id(5))).toBe('2-1-1');
    expect(numbers.get(id(6))).toBe('2-10-12');
  });

  it('numbers every material type the same way the course editor does', () => {
    const numbers = materialOutlineNumbers(context());

    expect(numbers.get(id(1))).toBe('1-1-1');
    expect(numbers.get(id(4))).toBe('1-1-3');
    expect(numbers.get(id(7))).toBe('2-10-3');
    expect(numbers.get(id(8))).toBe('2-10-5');
  });

  it('is empty while the course is loading', () => {
    expect(materialOutlineNumbers(null).size).toBe(0);
  });
});
