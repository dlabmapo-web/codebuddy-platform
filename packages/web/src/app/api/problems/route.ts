import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const chapterId = searchParams.get('chapter_id')?.trim() ?? '';

  if (!chapterId) return apiError('챕터를 선택해주세요.', 'INVALID_CHAPTER', 400);

  const db = supabaseAdmin();

  const { data: chapter } = await db
    .from('chapters')
    .select('id, title, description, order_no, stage_id, is_published')
    .eq('id', chapterId)
    .eq('is_published', true)
    .maybeSingle();

  if (!chapter) return apiError('챕터를 찾을 수 없습니다.', 'NOT_FOUND', 404);

  const { data: stage } = await db
    .from('stages')
    .select('id, title, order_no, subject_id, is_published')
    .eq('id', chapter.stage_id)
    .eq('is_published', true)
    .maybeSingle();

  if (!stage) return apiError('단계를 찾을 수 없습니다.', 'NOT_FOUND', 404);

  const { data: subject } = await db
    .from('subjects')
    .select('id, title, order_no, is_published')
    .eq('id', stage.subject_id)
    .eq('is_published', true)
    .maybeSingle();

  if (!subject) return apiError('과목을 찾을 수 없습니다.', 'NOT_FOUND', 404);

  let problemQuery = db
    .from('problems')
    .select('id, problem_no, chapter_id, order_no, title, difficulty, is_published, created_at')
    .eq('is_published', true)
    .eq('chapter_id', chapterId)
    .order('order_no', { ascending: true });

  if (q) problemQuery = problemQuery.ilike('title', `%${q}%`);

  const { data: problems, error } = await problemQuery;
  if (error) return apiError('문제 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const list = problems ?? [];
  const statusMap: Record<string, 'pass' | 'fail' | 'partial'> = {};
  if (list.length > 0) {
    const { data: submissions } = await db
      .from('submissions')
      .select('problem_id, status')
      .eq('user_id', user.id)
      .in('problem_id', list.map((p) => p.id));

    for (const s of submissions ?? []) {
      const prev = statusMap[s.problem_id];
      if (!prev || s.status === 'pass') statusMap[s.problem_id] = s.status;
    }
  }

  return apiOk({
    subject,
    stage,
    chapter,
    problems: list.map((p, pIdx) => {
      const best = statusMap[p.id];
      return {
        id: p.id,
        problem_no: p.problem_no,
        order_no: p.order_no,
        title: p.title,
        difficulty: p.difficulty,
        sub_no: pIdx + 1,
        solve_status: best === 'pass' ? 'solved' : best ? 'tried' : 'unsolved',
      };
    }),
  });
}
