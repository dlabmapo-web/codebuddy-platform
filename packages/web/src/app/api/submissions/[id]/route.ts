import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { id } = await params;

  const { data, error } = await supabaseAdmin()
    .from('submissions')
    .select('id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) return apiError('제출 기록을 찾을 수 없습니다.', 'NOT_FOUND', 404);
  return apiOk({ submission: data });
}
