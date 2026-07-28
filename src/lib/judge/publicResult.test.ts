import { describe, expect, it } from 'vitest';
import { serializeStudentSubmission } from './publicResult';

describe('serializeStudentSubmission', () => {
  const base = {
    id: 'submission-1',
    problem_id: 'problem-1',
    status: 'partial' as const,
    score: 50,
    passed_count: 1,
    total_count: 2,
    runtime_ms: 20,
    elapsed_sec: 30,
    submitted_at: '2026-07-27T00:00:00.000Z',
  };

  it('returns only redacted case metadata', () => {
    const result = serializeStudentSubmission(base, [
      { case_no: 1, is_sample_snapshot: true, outcome: 'accepted' },
      { case_no: 2, is_sample_snapshot: false, outcome: 'wrong_answer' },
    ]);

    expect(result.cases).toEqual([
      { case_no: 1, visibility: 'sample', outcome: 'accepted' },
      { case_no: 2, visibility: 'hidden', outcome: 'wrong_answer' },
    ]);
    expect(JSON.stringify(result)).not.toContain('expected');
    expect(JSON.stringify(result)).not.toContain('judge_token');
  });

  it('does not expose partial judging results', () => {
    const result = serializeStudentSubmission(
      { ...base, status: 'judging', score: 100, passed_count: 2 },
      [{ case_no: 1, is_sample_snapshot: false, outcome: 'accepted' }],
    );

    expect(result).toMatchObject({
      status: 'judging',
      score: 0,
      passed_count: 0,
      runtime_ms: null,
      cases: [],
    });
  });
});
