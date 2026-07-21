import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const stageId = req.nextUrl.searchParams.get('stage_id')?.trim() ?? '';
  if (!stageId) return apiError('단계를 선택해주세요.', 'INVALID_STAGE', 400);

  const db = supabaseAdmin();

  const { data: stage } = await db
    .from('stages')
    .select('id, title, order_no, subject_id, is_published')
    .eq('id', stageId)
    .eq('is_published', true)
    .maybeSingle();

  if (!stage) return apiError('단계를 찾을 수 없습니다.', 'NOT_FOUND', 404);

  const [subjectResult, chapterResult] = await Promise.all([
    db
      .from('subjects')
      .select('id, title, description, order_no, is_published')
      .eq('id', stage.subject_id)
      .eq('is_published', true)
      .maybeSingle(),
    db
      .from('chapters')
      .select('id, title, description, order_no, stage_id')
      .eq('stage_id', stageId)
      .eq('is_published', true)
      .order('order_no', { ascending: true }),
  ]);

  if (!subjectResult.data) return apiError('과목을 찾을 수 없습니다.', 'NOT_FOUND', 404);
  if (chapterResult.error) return apiError('챕터 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const chapters = chapterResult.data ?? [];
  const chapterIds = chapters.map((chapter) => chapter.id);
  if (chapterIds.length === 0) {
    return apiOk({ subject: subjectResult.data, stage, chapters: [] });
  }

  const [problemResult, submissionResult] = await Promise.all([
    db
      .from('problems')
      .select('id, problem_no, chapter_id, order_no, title, difficulty')
      .in('chapter_id', chapterIds)
      .eq('is_published', true)
      .order('order_no', { ascending: true }),
    db
      .from('submissions')
      .select('problem_id, status')
      .eq('user_id', user.id),
  ]);

  if (problemResult.error || submissionResult.error) {
    return apiError('문제 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }

  const solvedProblemIds = new Set(
    (submissionResult.data ?? [])
      .filter((submission) => submission.status === 'pass')
      .map((submission) => submission.problem_id),
  );
  const triedProblemIds = new Set((submissionResult.data ?? []).map((submission) => submission.problem_id));
  const problemsByChapter = new Map<string, Array<Record<string, unknown>>>();

  for (const problem of problemResult.data ?? []) {
    if (!problem.chapter_id) continue;
    const problems = problemsByChapter.get(problem.chapter_id) ?? [];
    problems.push({
      ...problem,
      solve_status: solvedProblemIds.has(problem.id)
        ? 'solved'
        : triedProblemIds.has(problem.id)
          ? 'tried'
          : 'unsolved',
    });
    problemsByChapter.set(problem.chapter_id, problems);
  }

  return apiOk({
    subject: subjectResult.data,
    stage,
    chapters: chapters.map((chapter) => ({
      ...chapter,
      problems: problemsByChapter.get(chapter.id) ?? [],
    })),
  });
}
