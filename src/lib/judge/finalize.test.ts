import { describe, expect, it } from 'vitest';
import {
  finalizeCaseResults,
  judge0SecondsToMs,
  mapJudge0Status,
} from './finalize';

describe('mapJudge0Status', () => {
  it('maps pending and final Judge0 statuses', () => {
    expect(mapJudge0Status(1)).toBeNull();
    expect(mapJudge0Status(2)).toBeNull();
    expect(mapJudge0Status(3)).toBe('accepted');
    expect(mapJudge0Status(4)).toBe('wrong_answer');
    expect(mapJudge0Status(5)).toBe('time_limit_exceeded');
    expect(mapJudge0Status(6)).toBe('compilation_error');
    expect(mapJudge0Status(7)).toBe('runtime_error');
    expect(mapJudge0Status(12)).toBe('runtime_error');
    expect(mapJudge0Status(13)).toBe('judge_error');
    expect(mapJudge0Status(999)).toBe('judge_error');
  });
});

describe('finalizeCaseResults', () => {
  it('passes only when every case is accepted', () => {
    expect(finalizeCaseResults([
      { outcome: 'accepted', runtimeMs: 10 },
      { outcome: 'accepted', runtimeMs: 12 },
    ])).toEqual({
      status: 'pass',
      score: 100,
      passedCount: 2,
      totalCount: 2,
      runtimeMs: 22,
    });
  });

  it('calculates an equal-weight partial score', () => {
    expect(finalizeCaseResults([
      { outcome: 'accepted', runtimeMs: 10 },
      { outcome: 'wrong_answer', runtimeMs: 12 },
      { outcome: 'time_limit_exceeded', runtimeMs: null },
    ])).toEqual({
      status: 'partial',
      score: 33,
      passedCount: 1,
      totalCount: 3,
      runtimeMs: 22,
    });
  });

  it('fails when no case passes', () => {
    expect(finalizeCaseResults([
      { outcome: 'compilation_error', runtimeMs: 4 },
      { outcome: 'runtime_error', runtimeMs: 5 },
    ])?.status).toBe('fail');
  });

  it('does not grade incomplete infrastructure results', () => {
    expect(finalizeCaseResults([
      { outcome: 'accepted', runtimeMs: 4 },
      { outcome: 'judge_error', runtimeMs: null },
    ])).toMatchObject({
      status: 'judge_error',
      score: 0,
      passedCount: 0,
    });
  });

  it('requires at least one case', () => {
    expect(finalizeCaseResults([])).toBeNull();
  });
});

describe('judge0SecondsToMs', () => {
  it('converts provider seconds and rejects invalid values', () => {
    expect(judge0SecondsToMs('0.018')).toBe(18);
    expect(judge0SecondsToMs(1.2)).toBe(1200);
    expect(judge0SecondsToMs(null)).toBeNull();
    expect(judge0SecondsToMs('invalid')).toBeNull();
  });
});
