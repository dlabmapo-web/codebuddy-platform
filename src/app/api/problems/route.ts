import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const categoryId = searchParams.get('category')?.trim() ?? '';

  const db = supabaseAdmin();

  const { data: categories, error: catErr } = await db
    .from('categories')
    .select('id, title, description, order_no, is_published')
    .eq('is_published', true)
    .order('order_no', { ascending: true });

  if (catErr) return apiError('카테고리 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  let problemQuery = db
    .from('problems')
    .select('id, problem_no, category_id, order_no, title, difficulty, is_published, created_at')
    .eq('is_published', true)
    .order('order_no', { ascending: true });

  if (q) problemQuery = problemQuery.ilike('title', `%${q}%`);
  if (categoryId) problemQuery = problemQuery.eq('category_id', categoryId);

  const { data: problems, error } = await problemQuery;
  if (error) return apiError('문제 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const publishedCatIds = new Set((categories ?? []).map((c) => c.id));
  const visibleProblems = (problems ?? []).filter((p) => p.category_id && publishedCatIds.has(p.category_id));

  const statusMap: Record<string, 'pass' | 'fail' | 'partial'> = {};
  if (visibleProblems.length > 0) {
    const { data: submissions } = await db
      .from('submissions')
      .select('problem_id, status')
      .eq('user_id', user.id)
      .in('problem_id', visibleProblems.map((p) => p.id));

    for (const s of submissions ?? []) {
      const prev = statusMap[s.problem_id];
      if (!prev || s.status === 'pass') statusMap[s.problem_id] = s.status;
    }
  }

  const byCategory: Record<string, typeof visibleProblems> = {};
  for (const p of visibleProblems) {
    (byCategory[p.category_id!] ??= []).push(p);
  }

  const result = (categories ?? [])
    .map((c, idx) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      order_no: c.order_no,
      level_no: idx + 1,
      problems: (byCategory[c.id] ?? []).map((p, pIdx) => {
        const best = statusMap[p.id];
        return {
          id: p.id,
          problem_no: p.problem_no,
          title: p.title,
          difficulty: p.difficulty,
          sub_no: pIdx + 1,
          solve_status: best === 'pass' ? 'solved' : best ? 'tried' : 'unsolved',
        };
      }),
    }))
    .filter((c) => c.problems.length > 0);

  return apiOk({ categories: result });
}
