import type {
  ChapterOption,
  CurriculumOption,
  CurriculumOptions,
  StageOption,
  Submission,
  SubmissionFilter,
} from './types';

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function curriculumOf(submission: Submission) {
  const problem = one(submission.problems);
  const chapter = one(problem?.chapters);
  const stage = one(chapter?.stages);
  const subject = one(stage?.subjects);
  return { problem, chapter, stage, subject };
}

export function curriculumOptionsOf(
  submissions: Submission[],
  subjectId: string,
  stageId: string,
): CurriculumOptions {
  const subjects = new Map<string, CurriculumOption>();
  const stages = new Map<string, StageOption>();
  const chapters = new Map<string, ChapterOption>();

  for (const submission of submissions) {
    const curriculum = curriculumOf(submission);
    if (curriculum.subject) subjects.set(curriculum.subject.id, curriculum.subject);
    if (curriculum.stage) {
      stages.set(curriculum.stage.id, {
        id: curriculum.stage.id,
        title: curriculum.stage.title,
        order_no: curriculum.stage.order_no,
        subject_id: curriculum.stage.subject_id,
      });
    }
    if (curriculum.chapter) {
      chapters.set(curriculum.chapter.id, {
        id: curriculum.chapter.id,
        title: curriculum.chapter.title,
        order_no: curriculum.chapter.order_no,
        stage_id: curriculum.chapter.stage_id,
      });
    }
  }

  return {
    subjects: Array.from(subjects.values()).sort((a, b) => a.order_no - b.order_no),
    stages: Array.from(stages.values())
      .filter((stage) => !subjectId || stage.subject_id === subjectId)
      .sort((a, b) => a.order_no - b.order_no),
    chapters: Array.from(chapters.values())
      .filter((chapter) => !stageId || chapter.stage_id === stageId)
      .sort((a, b) => a.order_no - b.order_no),
  };
}

export function filterSubmissions(
  submissions: Submission[],
  filter: SubmissionFilter,
  subjectId: string,
  stageId: string,
  chapterId: string,
) {
  return submissions.filter((submission) => {
    if (filter === 'pass' && submission.status !== 'pass') return false;
    if (filter === 'fail' && submission.status === 'pass') return false;

    const curriculum = curriculumOf(submission);
    if (subjectId && curriculum.subject?.id !== subjectId) return false;
    if (stageId && curriculum.stage?.id !== stageId) return false;
    if (chapterId && curriculum.chapter?.id !== chapterId) return false;
    return true;
  });
}

export function summarizeSubmissions(submissions: Submission[]) {
  const totalAttempts = submissions.length;
  const passedSubmissions = submissions.filter((submission) => submission.status === 'pass');
  const solvedProblems = new Set(passedSubmissions.map((submission) => submission.problem_id)).size;
  const correctRate = totalAttempts > 0
    ? Math.round((passedSubmissions.length / totalAttempts) * 100)
    : 0;

  return { totalAttempts, solvedProblems, correctRate };
}
