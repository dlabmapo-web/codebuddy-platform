import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import {
  resolveProblemNeighbors,
  type ProblemNavigation,
  type ProblemNavigationCandidate,
} from '@/lib/problems/navigation';

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

  let navigation: ProblemNavigation | null = null;

  if (problem.chapter_id) {
    const { data: currentChapter } = await db
      .from('chapters')
      .select('id, stage_id, order_no')
      .eq('id', problem.chapter_id)
      .eq('is_published', true)
      .maybeSingle();

    if (currentChapter?.stage_id) {
      const [{ data: stage }, { data: chapters }] = await Promise.all([
        db
          .from('stages')
          .select('id')
          .eq('id', currentChapter.stage_id)
          .eq('is_published', true)
          .maybeSingle(),
        db
          .from('chapters')
          .select('id, order_no')
          .eq('stage_id', currentChapter.stage_id)
          .eq('is_published', true)
          .order('order_no', { ascending: true }),
      ]);

      if (stage && chapters?.length) {
        const chapterOrder = new Map(
          chapters.map((chapter) => [chapter.id, chapter.order_no]),
        );
        const { data: stageProblems } = await db
          .from('problems')
          .select('id, problem_no, title, chapter_id, order_no, is_published')
          .in('chapter_id', chapters.map((chapter) => chapter.id))
          .eq('is_published', true);

        const candidates: ProblemNavigationCandidate[] = [];
        for (const stageProblem of stageProblems ?? []) {
          if (!stageProblem.chapter_id) continue;
          const chapterOrderNo = chapterOrder.get(stageProblem.chapter_id);
          if (chapterOrderNo === undefined) continue;

          candidates.push({
            id: stageProblem.id,
            problem_no: stageProblem.problem_no,
            title: stageProblem.title,
            chapter_id: stageProblem.chapter_id,
            chapter_order_no: chapterOrderNo,
            problem_order_no: stageProblem.order_no,
            is_published: stageProblem.is_published,
          });
        }

        navigation = {
          stage_id: stage.id,
          ...resolveProblemNeighbors(candidates, problem.id),
        };
      }
    }
  }

  return apiOk({
    problem,
    test_cases: test_cases ?? [],
    hints: hints ?? [],
    navigation,
    // Kept during the response-shape transition for existing clients.
    next_problem_id: navigation?.next?.id ?? null,
    stage_id: navigation?.stage_id ?? null,
  });
}
