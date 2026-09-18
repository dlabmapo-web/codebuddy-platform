import { describe, expect, it } from 'vitest';
import { parseNumberField, stepNumberField } from './number-field-value';

describe('numeric authoring values', () => {
  it('preserves optional emptiness while refusing empty required scores', () => {
    expect(parseNumberField('', 0, 10000, 0, true)).toBeNull();
    expect(parseNumberField('', 0, 10000, 0)).toBeNaN();
  });
  it('accepts decimal editing without rounding away unsupported precision', () => {
    expect(parseNumberField('1.', 0.01, 1000, 2)).toBe(1);
    expect(parseNumberField('.01', 0.01, 1000, 2)).toBe(0.01);
    expect(parseNumberField('1.001', 0.001, 60, 3)).toBe(1.001);
    expect(parseNumberField('1.001', 0.01, 1000, 2)).toBeNaN();
    expect(parseNumberField('1.00000000000000001', 0.01, 1000, 2)).toBeNaN();
    expect(parseNumberField('1.5', 0, 10000, 0)).toBeNaN();
  });
  it.each(['-', 'abc', 'Infinity', '1e2', '1001', '-1'])('rejects invalid score %s', (text) => {
    expect(parseNumberField(text, 0.01, 1000, 2)).toBeNaN();
  });
  it('steps decimal values without drift and stops at both bounds', () => {
    expect(stepNumberField(0.2, 1, 0.1, 0.1, 60, 3)).toBe(0.3);
    expect(stepNumberField(59.99, 1, 0.1, 0.1, 60, 3)).toBe(60);
    expect(stepNumberField(0.05, -1, 1, 0.01, 1000, 2)).toBe(0.01);
    expect(stepNumberField(null, 1, 0.1, 0.001, 60, 3)).toBe(0.001);
    expect(stepNumberField(Number.NaN, -1, 1, 0, 10000, 0)).toBe(0);
  });
});
