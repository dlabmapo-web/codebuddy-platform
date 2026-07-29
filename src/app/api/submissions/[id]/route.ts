import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { reconcileSubmission } from '@/lib/judge/submissionService';
import { serializeStudentSubmission } from '@/lib/judge/publicResult';
import { canTeacherMonitorStudent } from '@/lib/monitoring/teacherAccess.server';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role === 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const statusOnly = new URL(req.url).searchParams.get('mode') === 'status';

  const db = supabaseAdmin();
  let { data, error } = await db
    .from('submissions')
    .select('id, user_id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at')
    .eq('id', id)
    .single();

  if (error || !data) return apiError('제출 기록을 찾을 수 없습니다.', 'NOT_FOUND', 404);

  if (user.role === 'student' && data.user_id !== user.id) {
    return apiError('제출 기록을 찾을 수 없습니다.', 'NOT_FOUND', 404);
  }
  if (user.role === 'teacher') {
    const access = await canTeacherMonitorStudent(user.id, data.user_id);
    if (!access.allowed) {
      return apiError(
        access.reason === 'query_failed'
          ? '담당 학생 확인 중 오류가 발생했습니다.'
          : '권한이 없습니다.',
        access.reason === 'query_failed' ? 'INTERNAL_ERROR' : 'FORBIDDEN',
        access.reason === 'query_failed' ? 500 : 403,
      );
    }
  }

  if (!statusOnly && user.role === 'student' && data.status === 'judging') {
    try {
      await reconcileSubmission(db, data.id);
    } catch (reconcileError) {
      const ageMs = Date.now() - new Date(data.submitted_at).getTime();
      if (ageMs >= 10 * 60 * 1000) {
        await db
          .from('submissions')
          .update({ status: 'judge_error' })
          .eq('id', data.id)
          .eq('status', 'judging');
      }
      console.error('Judge reconciliation failed', {
        submissionId: data.id,
        error: reconcileError instanceof Error ? reconcileError.message : 'unknown',
      });
    }

    const refreshed = await db
      .from('submissions')
      .select('id, user_id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at')
      .eq('id', id)
      .single();
    data = refreshed.data ?? data;
    error = refreshed.error;
  }

  if (error || !data) return apiError('제출 기록을 찾을 수 없습니다.', 'NOT_FOUND', 404);

  if (statusOnly) {
    return apiOk({
      submission: {
        id: data.id,
        problem_id: data.problem_id,
        status: data.status,
        score: data.score,
        passed_count: data.passed_count,
        total_count: data.total_count,
        runtime_ms: data.runtime_ms,
        elapsed_sec: data.elapsed_sec,
        submitted_at: data.submitted_at,
      },
    });
  }

  const { data: cases } = await db
    .from('submission_test_results')
    .select('case_no, is_sample_snapshot, outcome')
    .eq('submission_id', data.id)
    .order('case_no', { ascending: true });

  return apiOk({
    submission: {
      ...serializeStudentSubmission(data, cases ?? []),
      code: data.code,
    },
  });
}
