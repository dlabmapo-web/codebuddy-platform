import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';
import {
  startSubmission,
  SubmissionValidationError,
} from '@/lib/judge/submissionService';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role === 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { searchParams } = new URL(req.url);
  const problemId = searchParams.get('problem_id');
  const studentId = searchParams.get('student_id');

  const db = supabaseAdmin();

  if (user.role === 'teacher' && studentId) {
    let query = db
      .from('submissions')
      .select(`
        id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at,
        problems(
          problem_no, title, difficulty, order_no, chapter_id,
          chapters(
            id, title, order_no, stage_id,
            stages(
              id, title, order_no, subject_id,
              subjects(id, title, order_no)
            )
          )
        ),
        users(id, name, username)
      `)
      .eq('user_id', studentId)
      .in('status', ['pass', 'fail', 'partial'])
      .order('submitted_at', { ascending: false });

    if (problemId) query = query.eq('problem_id', problemId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return apiOk({ submissions: data });
  }

  let query = db
    .from('submissions')
    .select(`
      id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at,
      problems(
        problem_no, title, difficulty, order_no, chapter_id,
        chapters(
          id, title, order_no, stage_id,
          stages(
            id, title, order_no, subject_id,
            subjects(id, title, order_no)
          )
        )
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['pass', 'fail', 'partial'])
    .order('submitted_at', { ascending: false });

  if (problemId) query = query.eq('problem_id', problemId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return apiOk({ submissions: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'student') {
    return apiError('학생 계정만 제출할 수 있습니다.', 'FORBIDDEN', 403);
  }

  const contentLength = Number.parseInt(req.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > 128 * 1024) {
    return apiError('요청 본문이 너무 큽니다.', 'PAYLOAD_TOO_LARGE', 413);
  }
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  try {
    const submission = await startSubmission(
      supabaseAdmin(),
      user.id,
      body,
      new URL(req.url).origin,
    );
    return apiOk({ submission }, 202);
  } catch (error) {
    if (error instanceof SubmissionValidationError) {
      return apiError(error.message, error.code, error.status);
    }
    console.error('Authoritative submission failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return apiError(
      '채점 서비스를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.',
      'JUDGE_START_FAILED',
      503,
    );
  }
}
