import { describe, expect, it } from 'vitest';
import { canAskAiForSyntaxHelp, recordSyntaxAttempt } from './syntaxCoach';

describe('syntax coaching attempts', () => {
  it('counts only changed code for the same error category', () => {
    const first = recordSyntaxAttempt(null, 'missing-colon', 'if ready');
    const unchanged = recordSyntaxAttempt(first, 'missing-colon', 'if ready');
    const second = recordSyntaxAttempt(unchanged, 'missing-colon', 'if  ready');
    const third = recordSyntaxAttempt(second, 'missing-colon', 'if ready ');

    expect(first.count).toBe(1);
    expect(unchanged).toBe(first);
    expect(second.count).toBe(2);
    expect(third.count).toBe(3);
    expect(canAskAiForSyntaxHelp(second)).toBe(false);
    expect(canAskAiForSyntaxHelp(third)).toBe(true);
  });

  it('starts again when the normalized category changes', () => {
    const previous = { category: 'missing-colon', count: 3, lastCode: 'if ready' };
    expect(recordSyntaxAttempt(previous, 'unexpected-indent', '  print(1)')).toEqual({
      category: 'unexpected-indent',
      count: 1,
      lastCode: '  print(1)',
    });
  });
});
