import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { reconcileSubmission } from '@/lib/judge/submissionService';
import { serializeStudentSubmission } from '@/lib/judge/publicResult';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { id } = await params;

  const db = supabaseAdmin();
  let { data, error } = await db
    .from('submissions')
    .select('id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return apiError('제출 기록을 찾을 수 없습니다.', 'NOT_FOUND', 404);

  if (data.status === 'judging') {
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
      .select('id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    data = refreshed.data ?? data;
    error = refreshed.error;
  }

  if (error || !data) return apiError('제출 기록을 찾을 수 없습니다.', 'NOT_FOUND', 404);

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
