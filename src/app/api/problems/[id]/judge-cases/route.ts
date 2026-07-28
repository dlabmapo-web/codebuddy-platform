import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role === 'student') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const { id } = await params;
  const db = supabaseAdmin();

  const { data: problem } = await db
    .from('problems')
    .select('id, is_published')
    .eq('id', id)
    .single();

  if (!problem) return apiError('문제를 찾을 수 없습니다.', 'NOT_FOUND', 404);
  const { data: test_cases, error } = await db
    .from('test_cases')
    .select('id, input, expected_output, is_sample, is_hidden, order_no')
    .eq('problem_id', id)
    .order('order_no', { ascending: true });

  if (error) return apiError('테스트케이스 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  return apiOk({ test_cases: test_cases ?? [] });
}
