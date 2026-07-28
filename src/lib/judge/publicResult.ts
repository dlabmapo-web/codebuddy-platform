import type { CaseOutcome, SubmissionStatus } from './types';

interface SubmissionRow {
  id: string;
  problem_id: string;
  status: SubmissionStatus;
  score: number;
  passed_count: number;
  total_count: number;
  runtime_ms: number | null;
  elapsed_sec: number | null;
  submitted_at: string;
}

interface CaseRow {
  case_no: number;
  is_sample_snapshot: boolean;
  outcome: CaseOutcome | null;
}

export function serializeStudentSubmission(
  submission: SubmissionRow,
  cases: CaseRow[],
) {
  return {
    id: submission.id,
    problem_id: submission.problem_id,
    status: submission.status,
    score: submission.status === 'judging' ? 0 : submission.score,
    passed_count: submission.status === 'judging' ? 0 : submission.passed_count,
    total_count: submission.total_count,
    runtime_ms: submission.status === 'judging' ? null : submission.runtime_ms,
    elapsed_sec: submission.elapsed_sec,
    submitted_at: submission.submitted_at,
    cases: submission.status === 'judging'
      ? []
      : cases.map((item) => ({
          case_no: item.case_no,
          visibility: item.is_sample_snapshot ? 'sample' as const : 'hidden' as const,
          outcome: item.outcome,
        })),
  };
}
