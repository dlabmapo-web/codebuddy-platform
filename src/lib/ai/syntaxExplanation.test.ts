import { describe, expect, it } from 'vitest';
import {
  buildKoreanSyntaxExplanationPrompt,
  extractErrorNeighborhood,
  isKoreanExplanation,
  parseSyntaxExplanationRequest,
  startOfCurrentKoreanDay,
} from './syntaxExplanation';

describe('syntax AI request parsing', () => {
  it('accepts a bounded structured syntax request', () => {
    const parsed = parseSyntaxExplanationRequest({
      problem_id: 'problem-1',
      code: 'if ready\n    print("go")',
      category: 'missing-colon',
      local_explanation: '콜론이 필요해요.',
      error: {
        type: 'SyntaxError',
        message: "expected ':'",
        line: 1,
        offset: 9,
        display: "SyntaxError: expected ':'",
      },
    });

    expect(parsed?.problemId).toBe('problem-1');
    expect(parsed?.error.offset).toBe(9);
  });

  it('rejects missing and malformed fields', () => {
    expect(parseSyntaxExplanationRequest({})).toBeNull();
    expect(parseSyntaxExplanationRequest({
      problem_id: 'problem-1',
      code: '',
      category: 'missing-colon',
      local_explanation: '',
      error: {},
    })).toBeNull();
  });
});

describe('syntax AI prompt context', () => {
  it('includes only the error neighborhood with line numbers', () => {
    const code = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n');
    expect(extractErrorNeighborhood(code, 4)).toBe(
      ['2   two', '3   three', '4 > four', '5   five', '6   six'].join('\n'),
    );
  });

  it('requires a short Korean teaching response without a completed answer', () => {
    const request = parseSyntaxExplanationRequest({
      problem_id: 'problem-1',
      code: 'if ready',
      category: 'missing-colon',
      local_explanation: '콜론이 필요해요.',
      error: {
        type: 'SyntaxError',
        message: "expected ':'",
        line: 1,
        offset: 9,
        display: "SyntaxError: expected ':'",
      },
    });
    expect(request).not.toBeNull();
    const prompt = buildKoreanSyntaxExplanationPrompt({
      problemTitle: '준비 확인',
      request: request!,
      lesson: {
        category: 'missing-colon',
        title: '콜론이 필요해요',
        whatHappened: '문장을 읽지 못했어요.',
        why: '코드 묶음을 표시해요.',
        where: '1번째 줄',
        example: 'if sunny:',
        nextStep: '줄 끝을 확인하세요.',
      },
    });
    expect(prompt.system).toContain('한국어로만');
    expect(prompt.system).toContain('완성된 코드나 정답 코드');
    expect(prompt.user).toContain('1 > if ready');
  });

  it('resets the daily quota at Korean midnight', () => {
    expect(startOfCurrentKoreanDay(new Date('2026-07-30T15:01:00Z'))).toBe(
      '2026-07-30T15:00:00.000Z',
    );
  });

  it('recognizes whether the generated explanation contains Korean', () => {
    expect(isKoreanExplanation('콜론을 확인해 보세요.')).toBe(true);
    expect(isKoreanExplanation('Check the colon.')).toBe(false);
  });
});
