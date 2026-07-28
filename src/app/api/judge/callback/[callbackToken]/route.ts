import { apiError, apiOk } from '@/lib/api/response';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashCallbackToken } from '@/lib/judge/security';
import { recordJudgeResult } from '@/lib/judge/submissionService';
import type { Judge0Result } from '@/lib/judge/types';

type Params = { params: Promise<{ callbackToken: string }> };

function isJudgeResult(value: unknown): value is Judge0Result {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    token?: unknown;
    status?: { id?: unknown };
    time?: unknown;
    memory?: unknown;
  };
  return (
    typeof candidate.token === 'string'
    && candidate.token.length > 0
    && typeof candidate.status?.id === 'number'
    && (
      candidate.time === undefined
      || candidate.time === null
      || typeof candidate.time === 'string'
      || typeof candidate.time === 'number'
    )
    && (
      candidate.memory === undefined
      || candidate.memory === null
      || typeof candidate.memory === 'number'
    )
  );
}

export async function POST(req: Request, { params }: Params) {
  const contentLength = Number.parseInt(req.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    return apiError('요청 본문이 너무 큽니다.', 'PAYLOAD_TOO_LARGE', 413);
  }

  const { callbackToken } = await params;
  if (callbackToken.length < 40 || callbackToken.length > 128) {
    return apiError('콜백을 확인할 수 없습니다.', 'INVALID_CALLBACK', 401);
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 64 * 1024) {
    return apiError('요청 본문이 너무 큽니다.', 'PAYLOAD_TOO_LARGE', 413);
  }
  const body: unknown = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();
  if (!isJudgeResult(body)) {
    return apiError('올바르지 않은 채점 결과입니다.', 'INVALID_JUDGE_RESULT', 400);
  }

  const db = supabaseAdmin();
  const { data: caseResult } = await db
    .from('submission_test_results')
    .select('id')
    .eq('callback_token_hash', hashCallbackToken(callbackToken))
    .maybeSingle();
  if (!caseResult) {
    return apiError('콜백을 확인할 수 없습니다.', 'INVALID_CALLBACK', 401);
  }

  const recorded = await recordJudgeResult(db, body, caseResult.id);
  if (recorded.tokenMismatch) {
    return apiError('콜백을 확인할 수 없습니다.', 'INVALID_CALLBACK', 401);
  }
  if (!recorded.found) {
    return apiError('채점 기록을 찾을 수 없습니다.', 'NOT_FOUND', 404);
  }
  return apiOk({ received: true });
}
