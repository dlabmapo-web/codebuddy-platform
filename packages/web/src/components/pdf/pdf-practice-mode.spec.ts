import { expect, it } from 'vitest';
import { isPdfRunOnly } from './pdf-practice-mode';
it('allows running PDF practice without offering unconfigured grading', () => {
  expect(isPdfRunOnly({ hasReferencePdf: true, sampleTestCases: [], hiddenTestCaseCount: 0 })).toBe(true);
  expect(isPdfRunOnly({ hasReferencePdf: true, sampleTestCases: [], hiddenTestCaseCount: 1 })).toBe(false);
  expect(isPdfRunOnly({ hasReferencePdf: false, sampleTestCases: [], hiddenTestCaseCount: 0 })).toBe(false);
});
