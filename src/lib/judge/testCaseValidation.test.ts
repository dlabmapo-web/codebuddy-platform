import { describe, expect, it } from 'vitest';
import { validateTestCases } from './testCaseValidation';

describe('validateTestCases', () => {
  const sample = {
    input: '1\n',
    expected_output: '2\n',
    is_sample: true,
    is_hidden: false,
    order_no: 1,
  };

  it('accepts complementary sample and hidden flags', () => {
    expect(validateTestCases([
      sample,
      { ...sample, is_sample: false, is_hidden: true, order_no: 2 },
    ])).toBeNull();
  });

  it('requires at least one case and an expected output', () => {
    expect(validateTestCases([])).toContain('1개 이상');
    expect(validateTestCases([{ ...sample, expected_output: '' }])).toContain('정답 출력값');
  });

  it('rejects ambiguous visibility', () => {
    expect(validateTestCases([
      { ...sample, is_sample: false, is_hidden: false },
    ])).toContain('예제 또는 비공개');
  });

  it('limits the case count', () => {
    expect(validateTestCases(Array.from({ length: 51 }, (_, index) => ({
      ...sample,
      order_no: index + 1,
    })))).toContain('최대 50개');
  });
});
