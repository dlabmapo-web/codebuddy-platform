export type SubmissionStatus = 'judging' | 'pass' | 'partial' | 'fail' | 'judge_error';

export type CaseOutcome =
  | 'accepted'
  | 'wrong_answer'
  | 'time_limit_exceeded'
  | 'compilation_error'
  | 'runtime_error'
  | 'judge_error';

export interface CompletedCaseResult {
  outcome: CaseOutcome;
  runtimeMs: number | null;
}

export interface AggregateJudgeResult {
  status: Exclude<SubmissionStatus, 'judging'>;
  score: number;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
}

export interface JudgeCaseRequest {
  sourceCode: string;
  stdin: string;
  expectedOutput: string;
  cpuTimeLimitSec: number;
  memoryLimitKb: number;
  callbackUrl: string;
}

export interface Judge0BatchToken {
  token: string;
}

export interface Judge0Result {
  token: string;
  status: { id: number; description?: string };
  time?: string | number | null;
  memory?: number | null;
}
