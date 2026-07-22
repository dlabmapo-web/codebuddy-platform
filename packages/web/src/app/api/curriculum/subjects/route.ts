import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const db = supabaseAdmin();
  const [subjectResult, stageResult, chapterResult, problemResult, submissionResult] = await Promise.all([
    db
      .from('subjects')
      .select('id, title, description, order_no')
      .eq('is_published', true)
      .order('order_no', { ascending: true }),
    db
      .from('stages')
      .select('id, subject_id, title, description, order_no')
      .eq('is_published', true)
      .order('order_no', { ascending: true }),
    db
      .from('chapters')
      .select('id, stage_id')
      .eq('is_published', true),
    db
      .from('problems')
      .select('id, chapter_id')
      .eq('is_published', true),
    db
      .from('submissions')
      .select('problem_id, status')
      .eq('user_id', user.id),
  ]);

  if (subjectResult.error || stageResult.error || chapterResult.error || problemResult.error || submissionResult.error) {
    return apiError('커리큘럼 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }

  const solvedProblemIds = new Set(
    (submissionResult.data ?? [])
      .filter((submission) => submission.status === 'pass')
      .map((submission) => submission.problem_id),
  );
  const publishedSubjectIds = new Set((subjectResult.data ?? []).map((subject) => subject.id));
  const publishedStageIds = new Set(
    (stageResult.data ?? [])
      .filter((stage) => publishedSubjectIds.has(stage.subject_id))
      .map((stage) => stage.id),
  );
  const chapterStageMap = new Map(
    (chapterResult.data ?? [])
      .filter((chapter) => publishedStageIds.has(chapter.stage_id))
      .map((chapter) => [chapter.id, chapter.stage_id]),
  );
  const stageStats = new Map<string, { chapterIds: Set<string>; problemCount: number; solvedCount: number }>();

  for (const [chapterId, stageId] of chapterStageMap) {
    const stat = stageStats.get(stageId) ?? { chapterIds: new Set(), problemCount: 0, solvedCount: 0 };
    stat.chapterIds.add(chapterId);
    stageStats.set(stageId, stat);
  }

  for (const problem of problemResult.data ?? []) {
    const stageId = problem.chapter_id ? chapterStageMap.get(problem.chapter_id) : null;
    if (!stageId) continue;
    const stat = stageStats.get(stageId) ?? { chapterIds: new Set(), problemCount: 0, solvedCount: 0 };
    stat.problemCount++;
    if (solvedProblemIds.has(problem.id)) stat.solvedCount++;
    stageStats.set(stageId, stat);
  }

  const stagesBySubject = new Map<string, Array<Record<string, unknown>>>();
  for (const stage of stageResult.data ?? []) {
    if (!publishedSubjectIds.has(stage.subject_id)) continue;
    const stat = stageStats.get(stage.id);
    const stages = stagesBySubject.get(stage.subject_id) ?? [];
    stages.push({
      ...stage,
      chapter_count: stat?.chapterIds.size ?? 0,
      problem_count: stat?.problemCount ?? 0,
      solved_count: stat?.solvedCount ?? 0,
    });
    stagesBySubject.set(stage.subject_id, stages);
  }

  return apiOk({
    subjects: (subjectResult.data ?? []).map((subject) => ({
      ...subject,
      stages: stagesBySubject.get(subject.id) ?? [],
    })),
  });
}
