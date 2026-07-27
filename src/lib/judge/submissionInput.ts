const MAX_CODE_BYTES = 64 * 1024;
const MAX_ELAPSED_SEC = 24 * 60 * 60;

export interface SubmissionInput {
  problem_id?: unknown;
  language?: unknown;
  code?: unknown;
  elapsed_sec?: unknown;
  status?: unknown;
  score?: unknown;
  passed_count?: unknown;
  total_count?: unknown;
  runtime_ms?: unknown;
}

export class SubmissionValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function validateSubmissionInput(body: SubmissionInput) {
  const forbidden = ['status', 'score', 'passed_count', 'total_count', 'runtime_ms']
    .some((key) => body[key as keyof SubmissionInput] !== undefined);
  if (forbidden) {
    throw new SubmissionValidationError(
      '채점 결과는 서버에서만 결정할 수 있습니다.',
      'CLIENT_GRADING_FIELDS_FORBIDDEN',
      400,
    );
  }

  if (typeof body.problem_id !== 'string' || !body.problem_id) {
    throw new SubmissionValidationError('문제 ID가 필요합니다.', 'MISSING_PROBLEM_ID', 400);
  }
  if (body.language !== undefined && body.language !== 'python') {
    throw new SubmissionValidationError('Python만 지원합니다.', 'UNSUPPORTED_LANGUAGE', 400);
  }
  if (typeof body.code !== 'string' || body.code.trim().length === 0) {
    throw new SubmissionValidationError('제출할 코드를 입력해주세요.', 'MISSING_CODE', 400);
  }
  if (Buffer.byteLength(body.code, 'utf8') > MAX_CODE_BYTES) {
    throw new SubmissionValidationError('코드는 64 KiB 이하여야 합니다.', 'CODE_TOO_LARGE', 413);
  }

  const rawElapsed = typeof body.elapsed_sec === 'number' ? body.elapsed_sec : 0;
  const elapsedSec = Math.max(0, Math.min(MAX_ELAPSED_SEC, Math.floor(rawElapsed)));
  return {
    problemId: body.problem_id,
    code: body.code,
    elapsedSec,
  };
}
