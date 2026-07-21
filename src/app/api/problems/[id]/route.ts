import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { id } = await params;
  const db = supabaseAdmin();

  const { data: problem, error } = await db
    .from('problems')
    .select('*')
    .eq('id', id)
    .eq('is_published', true)
    .single();

  if (error || !problem) return apiError('문제를 찾을 수 없습니다.', 'NOT_FOUND', 404);

  const { data: test_cases } = await db
    .from('test_cases')
    .select('id, input, expected_output, is_sample, order_no')
    .eq('problem_id', id)
    .eq('is_sample', true)
    .order('order_no', { ascending: true });

  const { data: hints } = await db
    .from('problem_hints')
    .select('id, hint_text, order_no')
    .eq('problem_id', id)
    .order('order_no', { ascending: true });

  let next_problem_id: string | null = null;
  let stage_id: string | null = null;

  if (problem.chapter_id) {
    const [{ data: nextProblem }, { data: chapter }] = await Promise.all([
      db
        .from('problems')
        .select('id')
        .eq('chapter_id', problem.chapter_id)
        .eq('is_published', true)
        .gt('order_no', problem.order_no)
        .order('order_no', { ascending: true })
        .limit(1)
        .maybeSingle(),
      db
        .from('chapters')
        .select('stage_id')
        .eq('id', problem.chapter_id)
        .maybeSingle(),
    ]);
    next_problem_id = nextProblem?.id ?? null;
    stage_id = chapter?.stage_id ?? null;
  }

  return apiOk({
    problem,
    test_cases: test_cases ?? [],
    hints: hints ?? [],
    next_problem_id,
    stage_id,
  });
}
