import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';

type SubjectEmbed = { id: string; title: string; order_no: number };
type StageEmbed = {
  id: string;
  title: string;
  order_no: number;
  subject_id: string;
  subjects: SubjectEmbed | SubjectEmbed[] | null;
};
type ChapterEmbed = {
  id: string;
  title: string;
  order_no: number;
  stage_id: string;
  stages: StageEmbed | StageEmbed[] | null;
};
type ProblemRow = {
  id: string;
  problem_no: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order_no: number;
  chapter_id: string | null;
  chapters: ChapterEmbed | ChapterEmbed[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'teacher') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const db = supabaseAdmin();

  const { data: problems, error: probErr } = await db
    .from('problems')
    .select(`
      id, problem_no, title, difficulty, order_no, chapter_id,
      chapters (
        id, title, order_no, stage_id,
        stages (
          id, title, order_no, subject_id,
          subjects ( id, title, order_no )
        )
      )
    `)
    .eq('is_published', true)
    .order('order_no', { ascending: true });

  if (probErr) return apiError('문제 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const list = (problems ?? []) as unknown as ProblemRow[];
  const problemIds = list.map((p) => p.id);
  if (problemIds.length === 0) {
    return apiOk({ subjects: [], problems: [] });
  }

  const { data: submissions, error: subErr } = await db
    .from('submissions')
    .select('problem_id, status, user_id, elapsed_sec')
    .in('problem_id', problemIds)
    .in('status', ['pass', 'fail', 'partial']);

  if (subErr) return apiError('제출 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const statsMap: Record<string, { total: number; passed: number; students: Set<string>; totalElapsed: number; elapsedCount: number }> = {};
  for (const s of submissions ?? []) {
    if (!statsMap[s.problem_id]) {
      statsMap[s.problem_id] = { total: 0, passed: 0, students: new Set(), totalElapsed: 0, elapsedCount: 0 };
    }
    const stat = statsMap[s.problem_id];
    stat.total++;
    stat.students.add(s.user_id);
    if (s.status === 'pass') stat.passed++;
    if (s.elapsed_sec) { stat.totalElapsed += s.elapsed_sec; stat.elapsedCount++; }
  }

  type ProblemStat = {
    id: string;
    problem_no: number;
    order_no: number;
    title: string;
    difficulty: 'easy' | 'medium' | 'hard';
    student_count: number;
    submission_count: number;
    pass_count: number;
    pass_rate: number;
    avg_elapsed_sec: number | null;
    chapter_id: string;
    chapter_title: string;
    chapter_order_no: number;
    stage_id: string;
    stage_title: string;
    stage_order_no: number;
    subject_id: string;
    subject_title: string;
    subject_order_no: number;
  };

  const flat: ProblemStat[] = [];
  for (const p of list) {
    const chapter = one(p.chapters);
    const stage = one(chapter?.stages);
    const subject = one(stage?.subjects);
    if (!chapter || !stage || !subject) continue;

    const stat = statsMap[p.id];
    const studentCount = stat?.students.size ?? 0;
    const total = stat?.total ?? 0;
    const passed = stat?.passed ?? 0;
    const avgElapsed = stat && stat.elapsedCount > 0 ? Math.round(stat.totalElapsed / stat.elapsedCount) : null;

    flat.push({
      id: p.id,
      problem_no: p.problem_no,
      order_no: p.order_no,
      title: p.title,
      difficulty: p.difficulty,
      student_count: studentCount,
      submission_count: total,
      pass_count: passed,
      pass_rate: total > 0 ? Math.round((passed / total) * 100) : 0,
      avg_elapsed_sec: avgElapsed,
      chapter_id: chapter.id,
      chapter_title: chapter.title,
      chapter_order_no: chapter.order_no,
      stage_id: stage.id,
      stage_title: stage.title,
      stage_order_no: stage.order_no,
      subject_id: subject.id,
      subject_title: subject.title,
      subject_order_no: subject.order_no,
    });
  }

  flat.sort((a, b) =>
    a.subject_order_no - b.subject_order_no
    || a.subject_title.localeCompare(b.subject_title)
    || a.stage_order_no - b.stage_order_no
    || a.chapter_order_no - b.chapter_order_no
    || a.order_no - b.order_no
  );

  type ChapterNode = {
    id: string;
    title: string;
    order_no: number;
    problems: ProblemStat[];
  };
  type StageNode = {
    id: string;
    title: string;
    order_no: number;
    chapters: ChapterNode[];
  };
  type SubjectNode = {
    id: string;
    title: string;
    order_no: number;
    stages: StageNode[];
  };

  const subjects: SubjectNode[] = [];
  const subjectMap = new Map<string, SubjectNode>();
  const stageMap = new Map<string, StageNode>();
  const chapterMap = new Map<string, ChapterNode>();

  for (const p of flat) {
    let subject = subjectMap.get(p.subject_id);
    if (!subject) {
      subject = { id: p.subject_id, title: p.subject_title, order_no: p.subject_order_no, stages: [] };
      subjectMap.set(p.subject_id, subject);
      subjects.push(subject);
    }

    let stage = stageMap.get(p.stage_id);
    if (!stage) {
      stage = { id: p.stage_id, title: p.stage_title, order_no: p.stage_order_no, chapters: [] };
      stageMap.set(p.stage_id, stage);
      subject.stages.push(stage);
    }

    let chapter = chapterMap.get(p.chapter_id);
    if (!chapter) {
      chapter = { id: p.chapter_id, title: p.chapter_title, order_no: p.chapter_order_no, problems: [] };
      chapterMap.set(p.chapter_id, chapter);
      stage.chapters.push(chapter);
    }

    chapter.problems.push(p);
  }

  return apiOk({ subjects, problems: flat });
}
