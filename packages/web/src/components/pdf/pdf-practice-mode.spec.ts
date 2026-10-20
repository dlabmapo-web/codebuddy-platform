import { expect, it } from 'vitest';
import { isPdfRunOnly } from './pdf-practice-mode';
it('allows running PDF practice without offering unconfigured grading', () => {
  expect(isPdfRunOnly({ hasReferencePdf: true, sampleTestCases: [], hiddenTestCaseCount: 0 })).toBe(true);
  expect(isPdfRunOnly({ hasReferencePdf: true, sampleTestCases: [], hiddenTestCaseCount: 1 })).toBe(false);
  expect(isPdfRunOnly({ hasReferencePdf: false, sampleTestCases: [], hiddenTestCaseCount: 0 })).toBe(false);
});

it('uses explicit policy instead of guessing from the retained test count', () => {
  expect(isPdfRunOnly({ hasReferencePdf: true, submissionPolicy: 'PRACTICE_ONLY', sampleTestCases: [], hiddenTestCaseCount: 1 })).toBe(true);
  expect(isPdfRunOnly({ hasReferencePdf: true, submissionPolicy: 'AUTOMATIC', sampleTestCases: [], hiddenTestCaseCount: 0 })).toBe(false);
});
