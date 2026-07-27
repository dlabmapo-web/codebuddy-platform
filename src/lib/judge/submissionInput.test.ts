import { describe, expect, it } from 'vitest';
import {
  SubmissionValidationError,
  validateSubmissionInput,
} from './submissionInput';

describe('validateSubmissionInput', () => {
  it('accepts only code-oriented submission data', () => {
    expect(validateSubmissionInput({
      problem_id: 'problem-1',
      language: 'python',
      code: 'print(1)',
      elapsed_sec: 42.9,
    })).toEqual({
      problemId: 'problem-1',
      code: 'print(1)',
      elapsedSec: 42,
    });
  });

  it.each(['status', 'score', 'passed_count', 'total_count', 'runtime_ms'])(
    'rejects client grading field %s',
    (field) => {
      expect(() => validateSubmissionInput({
        problem_id: 'problem-1',
        code: 'print(1)',
        [field]: field === 'status' ? 'pass' : 100,
      })).toThrowError(SubmissionValidationError);
    },
  );

  it('rejects unsupported languages and oversized code', () => {
    expect(() => validateSubmissionInput({
      problem_id: 'problem-1',
      language: 'javascript',
      code: 'console.log(1)',
    })).toThrowError(/Python/);
    expect(() => validateSubmissionInput({
      problem_id: 'problem-1',
      code: 'x'.repeat(64 * 1024 + 1),
    })).toThrowError(/64 KiB/);
  });
});
