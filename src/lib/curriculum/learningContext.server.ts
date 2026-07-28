import 'server-only';

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  buildLearningContext,
  type LearningContext,
  type LearningContextPath,
} from './learningContext';

type SubjectEmbed = { id: string; title: string };
type StageEmbed = {
  id: string;
  title: string;
  subject_id: string;
  subjects: SubjectEmbed | SubjectEmbed[] | null;
};
type ChapterEmbed = {
  id: string;
  title: string;
  stage_id: string;
  stages: StageEmbed | StageEmbed[] | null;
};
type ProblemPathRow = {
  id: string;
  problem_no: number;
  title: string;
  chapter_id: string | null;
  chapters: ChapterEmbed | ChapterEmbed[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getLearningPath(
  problemId: string
): Promise<LearningContextPath | null> {
  const { data, error } = await supabaseAdmin()
    .from('problems')
    .select(`
      id, problem_no, title, chapter_id,
      chapters!inner (
        id, title, stage_id,
        stages!inner (
          id, title, subject_id,
          subjects!inner ( id, title )
        )
      )
    `)
    .eq('id', problemId)
    .eq('is_published', true)
    .eq('chapters.is_published', true)
    .eq('chapters.stages.is_published', true)
    .eq('chapters.stages.subjects.is_published', true)
    .maybeSingle();

  if (error || !data) return null;
  const problem = data as unknown as ProblemPathRow;
  const chapter = one(problem.chapters);
  const stage = one(chapter?.stages);
  const subject = one(stage?.subjects);
  if (!chapter || !stage || !subject) return null;

  return {
    subject: { id: subject.id, title: subject.title },
    stage: { id: stage.id, title: stage.title },
    chapter: { id: chapter.id, title: chapter.title },
    problem: {
      id: problem.id,
      problemNo: problem.problem_no,
      title: problem.title,
    },
  };
}

export async function getLearningContext({
  problemId,
  studentId,
}: {
  problemId: string;
  studentId: string;
}): Promise<LearningContext | null> {
  const path = await getLearningPath(problemId);
  if (!path) return null;

  const db = supabaseAdmin();
  const { data: stageRows, error: stageError } = await db
    .from('stages')
    .select('id, subject_id, title, order_no, is_published')
    .eq('subject_id', path.subject.id)
    .eq('is_published', true)
    .order('order_no', { ascending: true });
  if (stageError) return null;

  const stageIds = (stageRows ?? []).map((stage) => stage.id);
  if (stageIds.length === 0) {
    return buildLearningContext({
      path,
      stages: [],
      chapters: [],
      problems: [],
      submissions: [],
    });
  }

  const { data: chapterRows, error: chapterError } = await db
    .from('chapters')
    .select('id, stage_id, title, order_no, is_published')
    .in('stage_id', stageIds)
    .eq('is_published', true)
    .order('order_no', { ascending: true });
  if (chapterError) return null;

  const chapterIds = (chapterRows ?? []).map((chapter) => chapter.id);
  if (chapterIds.length === 0) {
    return buildLearningContext({
      path,
      stages: (stageRows ?? []).map((stage) => ({
        id: stage.id,
        subjectId: stage.subject_id,
        title: stage.title,
        orderNo: stage.order_no,
        isPublished: stage.is_published,
      })),
      chapters: [],
      problems: [],
      submissions: [],
    });
  }

  const { data: problemRows, error: problemError } = await db
    .from('problems')
    .select('id, chapter_id, problem_no, title, order_no, is_published')
    .in('chapter_id', chapterIds)
    .eq('is_published', true)
    .order('order_no', { ascending: true });
  if (problemError) return null;

  const problemIds = (problemRows ?? []).map((problem) => problem.id);
  const { data: submissionRows, error: submissionError } = problemIds.length > 0
    ? await db
      .from('submissions')
      .select('problem_id, status')
      .eq('user_id', studentId)
      .in('problem_id', problemIds)
    : { data: [], error: null };
  if (submissionError) return null;

  return buildLearningContext({
    path,
    stages: (stageRows ?? []).map((stage) => ({
      id: stage.id,
      subjectId: stage.subject_id,
      title: stage.title,
      orderNo: stage.order_no,
      isPublished: stage.is_published,
    })),
    chapters: (chapterRows ?? []).map((chapter) => ({
      id: chapter.id,
      stageId: chapter.stage_id,
      title: chapter.title,
      orderNo: chapter.order_no,
      isPublished: chapter.is_published,
    })),
    problems: (problemRows ?? []).map((problem) => ({
      id: problem.id,
      chapterId: problem.chapter_id,
      problemNo: problem.problem_no,
      title: problem.title,
      orderNo: problem.order_no,
      isPublished: problem.is_published,
    })),
    submissions: (submissionRows ?? []).map((submission) => ({
      problemId: submission.problem_id,
      status: submission.status,
    })),
  });
}
