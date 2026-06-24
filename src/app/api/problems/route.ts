import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const sort = searchParams.get('sort') ?? 'no';

  const db = supabaseAdmin();
  let query = db
    .from('problems')
    .select('id, problem_no, title, difficulty, time_limit_ms, memory_limit_mb, is_published, created_at')
    .eq('is_published', true);

  if (q) query = query.ilike('title', `%${q}%`);
  query = query.order(sort === 'difficulty' ? 'difficulty' : 'problem_no', { ascending: true });

  const { data: problems, error } = await query;
  if (error) return apiError('문제 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  if (!problems?.length) return apiOk({ problems: [] });

  const { data: submissions } = await db
    .from('submissions')
    .select('problem_id, status')
    .eq('user_id', user.id)
    .in('problem_id', problems.map((p) => p.id));

  const statusMap: Record<string, 'pass' | 'fail' | 'partial'> = {};
  for (const s of submissions ?? []) {
    const prev = statusMap[s.problem_id];
    if (!prev || s.status === 'pass') statusMap[s.problem_id] = s.status;
  }

  const result = problems.map((p) => {
    const best = statusMap[p.id];
    const solveStatus = best === 'pass' ? 'solved' : best ? 'tried' : 'unsolved';
    return { ...p, solve_status: solveStatus };
  });

  return apiOk({ problems: result });
}
