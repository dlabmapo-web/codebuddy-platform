import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createJudge0Batch, getJudge0Batch } from './judge0Client';
import {
  finalizeCaseResults,
  judge0SecondsToMs,
  mapJudge0Status,
} from './finalize';
import { createCallbackToken, hashCallbackToken } from './security';
import type { Judge0Result, SubmissionStatus } from './types';
import {
  SubmissionValidationError,
  validateSubmissionInput,
  type SubmissionInput,
} from './submissionInput';

const MAX_CASE_TEXT_BYTES = 64 * 1024;
const MAX_TEST_CASES = 50;
const SUBMISSION_RATE_LIMIT = 10;

type DbClient = SupabaseClient;

interface TestCaseRow {
  id: string;
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
  order_no: number;
}

interface CaseDispatchRow {
  id: string;
  callbackToken: string;
  testCase: TestCaseRow;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function callbackBaseUrl(requestOrigin: string): string {
  const configured = process.env.JUDGE_CALLBACK_BASE_URL?.replace(/\/+$/, '');
  return configured || requestOrigin.replace(/\/+$/, '');
}

async function markJudgeError(db: DbClient, submissionId: string) {
  await db
    .from('submissions')
    .update({ status: 'judge_error' satisfies SubmissionStatus })
    .eq('id', submissionId)
    .eq('status', 'judging');
}

async function bindJudgeToken(
  db: DbClient,
  caseResultId: string,
  judgeToken: string,
): Promise<boolean> {
  const { data: bound, error } = await db
    .from('submission_test_results')
    .update({ judge_token: judgeToken })
    .eq('id', caseResultId)
    .is('judge_token', null)
    .select('judge_token')
    .maybeSingle();

  if (error) return false;
  if (bound?.judge_token === judgeToken) return true;

  const { data: existing } = await db
    .from('submission_test_results')
    .select('judge_token')
    .eq('id', caseResultId)
    .maybeSingle();
  return existing?.judge_token === judgeToken;
}

export async function startSubmission(
  db: DbClient,
  userId: string,
  rawBody: SubmissionInput,
  requestOrigin: string,
) {
  const input = validateSubmissionInput(rawBody);

  const { data: active } = await db
    .from('submissions')
    .select('id')
    .eq('user_id', userId)
    .eq('problem_id', input.problemId)
    .eq('status', 'judging')
    .maybeSingle();
  if (active) {
    throw new SubmissionValidationError(
      '이미 이 문제를 채점하고 있습니다.',
      'SUBMISSION_ALREADY_JUDGING',
      409,
    );
  }

  const { data: allowed, error: rateError } = await db.rpc(
    'consume_submission_rate_limit',
    { p_user_id: userId, p_limit: SUBMISSION_RATE_LIMIT },
  );
  if (rateError) {
    throw new Error(`Submission rate limit failed: ${rateError.message}`);
  }
  if (!allowed) {
    throw new SubmissionValidationError(
      '제출이 너무 빠릅니다. 잠시 후 다시 시도해주세요.',
      'RATE_LIMITED',
      429,
    );
  }

  const [{ data: problem }, { data: testCases, error: casesError }] = await Promise.all([
    db
      .from('problems')
      .select('id, is_published, time_limit_ms, memory_limit_mb')
      .eq('id', input.problemId)
      .maybeSingle(),
    db
      .from('test_cases')
      .select('id, input, expected_output, is_sample, is_hidden, order_no')
      .eq('problem_id', input.problemId)
      .order('order_no', { ascending: true }),
  ]);

  if (!problem?.is_published) {
    throw new SubmissionValidationError('문제를 찾을 수 없습니다.', 'NOT_FOUND', 404);
  }
  if (casesError) throw new Error(`Test case load failed: ${casesError.message}`);

  const cases = (testCases ?? []) as TestCaseRow[];
  if (cases.length === 0) {
    throw new SubmissionValidationError(
      '채점 테스트가 설정되지 않았습니다.',
      'NO_TEST_CASES',
      409,
    );
  }
  if (cases.length > MAX_TEST_CASES) {
    throw new SubmissionValidationError(
      '테스트케이스가 50개를 초과했습니다.',
      'TOO_MANY_TEST_CASES',
      409,
    );
  }
  for (const testCase of cases) {
    if (testCase.is_sample === testCase.is_hidden) {
      throw new SubmissionValidationError(
        '테스트케이스 공개 설정이 올바르지 않습니다.',
        'INVALID_TEST_CASE_VISIBILITY',
        409,
      );
    }
    if (
      byteLength(testCase.input ?? '') > MAX_CASE_TEXT_BYTES
      || byteLength(testCase.expected_output ?? '') > MAX_CASE_TEXT_BYTES
    ) {
      throw new SubmissionValidationError(
        '테스트케이스 입력과 출력은 각각 64 KiB 이하여야 합니다.',
        'TEST_CASE_TOO_LARGE',
        409,
      );
    }
  }

  const { data: submission, error: submissionError } = await db
    .from('submissions')
    .insert({
      problem_id: input.problemId,
      user_id: userId,
      language: 'python',
      code: input.code,
      status: 'judging',
      score: 0,
      passed_count: 0,
      total_count: cases.length,
      runtime_ms: null,
      elapsed_sec: input.elapsedSec,
    })
    .select('id, problem_id, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at')
    .single();

  if (submissionError || !submission) {
    if (submissionError?.code === '23505') {
      throw new SubmissionValidationError(
        '이미 이 문제를 채점하고 있습니다.',
        'SUBMISSION_ALREADY_JUDGING',
        409,
      );
    }
    throw new Error(`Submission create failed: ${submissionError?.message ?? 'unknown error'}`);
  }

  const dispatchRows = cases.map((testCase) => ({
    testCase,
    callbackToken: createCallbackToken(),
  }));
  const { data: insertedCases, error: caseInsertError } = await db
    .from('submission_test_results')
    .insert(dispatchRows.map((item, index) => ({
      submission_id: submission.id,
      test_case_id: item.testCase.id,
      case_no: index + 1,
      is_sample_snapshot: item.testCase.is_sample,
      callback_token_hash: hashCallbackToken(item.callbackToken),
    })))
    .select('id, case_no')
    .order('case_no', { ascending: true });

  if (caseInsertError || insertedCases?.length !== cases.length) {
    await markJudgeError(db, submission.id);
    throw new Error(`Submission case create failed: ${caseInsertError?.message ?? 'row mismatch'}`);
  }

  const caseRows: CaseDispatchRow[] = insertedCases.map((row, index) => ({
    id: row.id,
    callbackToken: dispatchRows[index].callbackToken,
    testCase: dispatchRows[index].testCase,
  }));

  try {
    const baseUrl = callbackBaseUrl(requestOrigin);
    const tokens = await createJudge0Batch(caseRows.map((item) => ({
      sourceCode: input.code,
      stdin: item.testCase.input ?? '',
      expectedOutput: item.testCase.expected_output,
      cpuTimeLimitSec: Math.max(0.1, problem.time_limit_ms / 1000),
      memoryLimitKb: Math.max(1024, problem.memory_limit_mb * 1024),
      callbackUrl: `${baseUrl}/api/judge/callback/${item.callbackToken}`,
    })));

    const bindings = await Promise.all(tokens.map((token, index) => (
      bindJudgeToken(db, caseRows[index].id, token.token)
    )));
    if (bindings.some((bound) => !bound)) {
      throw new Error('Judge0 token binding mismatch');
    }
  } catch (error) {
    await markJudgeError(db, submission.id);
    throw error;
  }

  return submission;
}

export { SubmissionValidationError };

export async function finalizeSubmissionIfReady(db: DbClient, submissionId: string) {
  const { data: rows, error } = await db
    .from('submission_test_results')
    .select('outcome, runtime_ms')
    .eq('submission_id', submissionId);
  if (error || !rows || rows.length === 0 || rows.some((item) => !item.outcome)) return null;

  const aggregate = finalizeCaseResults(rows.map((item) => ({
    outcome: item.outcome,
    runtimeMs: item.runtime_ms,
  })));
  if (!aggregate) return null;

  const { data: finalized } = await db
    .from('submissions')
    .update({
      status: aggregate.status,
      score: aggregate.score,
      passed_count: aggregate.passedCount,
      total_count: aggregate.totalCount,
      runtime_ms: aggregate.runtimeMs,
    })
    .eq('id', submissionId)
    .eq('status', 'judging')
    .select('id, problem_id, user_id, status')
    .maybeSingle();

  if (finalized?.status === 'pass') {
    await db
      .from('collaboration_sessions')
      .update({ final_code: null })
      .eq('student_id', finalized.user_id)
      .eq('problem_id', finalized.problem_id);
  }
  return aggregate;
}

export async function recordJudgeResult(
  db: DbClient,
  result: Judge0Result,
  expectedCaseId?: string,
) {
  let query = db
    .from('submission_test_results')
    .select('id, submission_id, judge_token, outcome');
  query = expectedCaseId
    ? query.eq('id', expectedCaseId)
    : query.eq('judge_token', result.token);
  const { data: row } = await query.maybeSingle();
  if (!row) return { found: false, complete: false };

  if (row.judge_token && row.judge_token !== result.token) {
    return { found: true, complete: false, tokenMismatch: true };
  }
  if (!row.judge_token) {
    const bound = await bindJudgeToken(db, row.id, result.token);
    if (!bound) return { found: true, complete: false, tokenMismatch: true };
  }

  const outcome = mapJudge0Status(result.status.id);
  if (!outcome) return { found: true, complete: false };

  if (!row.outcome) {
    await db
      .from('submission_test_results')
      .update({
        outcome,
        runtime_ms: judge0SecondsToMs(result.time),
        memory_kb: typeof result.memory === 'number' ? Math.max(0, Math.round(result.memory)) : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .is('outcome', null);
  }

  const aggregate = await finalizeSubmissionIfReady(db, row.submission_id);
  return { found: true, complete: aggregate !== null, aggregate };
}

export async function reconcileSubmission(db: DbClient, submissionId: string) {
  const { data: rows } = await db
    .from('submission_test_results')
    .select('id, judge_token, outcome')
    .eq('submission_id', submissionId);
  const outstanding = (rows ?? []).filter((item) => !item.outcome && item.judge_token);
  if (outstanding.length === 0) return finalizeSubmissionIfReady(db, submissionId);

  const results = await getJudge0Batch(outstanding.map((item) => item.judge_token));
  for (const result of results) {
    await recordJudgeResult(db, result);
  }
  return finalizeSubmissionIfReady(db, submissionId);
}
